from pathlib import Path
import time

import pandas as pd
from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait


START_URL = "https://www.aaa.com/stop/"

# Your chosen ZIPs + output filenames
ZIP_CONFIG = [
    {"place": "Doylestown", "zip_code": "18901", "filename": "DoylestownGas.csv"},
    {"place": "FairlessHills", "zip_code": "19030", "filename": "FairlessHillsGas.csv"},
    {"place": "Perkasie", "zip_code": "18944", "filename": "PerkasieGas.csv"},
    {"place": "Bensalem", "zip_code": "19020", "filename": "BensalemGas.csv"},
    {"place": "Morrisville", "zip_code": "19067", "filename": "MorrisvilleGas.csv"},
]


OUTPUT_DIR = Path("BucksGasPrices")
OUTPUT_DIR.mkdir(exist_ok=True)


def open_fuel_finder(zip_code: str) -> str:
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 20)

    try:
        # 1) Go to club selector
        driver.get(START_URL)

        # Enter ZIP
        zip_box = wait.until(
            EC.presence_of_element_located((By.ID, "zipCode"))
        )
        zip_box.clear()
        zip_box.send_keys(zip_code)

        # Click Go
        go_btn = wait.until(
            EC.element_to_be_clickable((By.ID, "goButton"))
        )
        go_btn.click()

        # 2) Wait for redirect to club alliance
        wait.until(lambda d: "cluballiance.aaa.com" in d.current_url)
        print(f"[{zip_code}] After Go: {driver.current_url}")

        # Close cookie banner if present
        try:
            cookie_btn = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable(
                    (By.XPATH, "//button[contains(., 'OK') or contains(., 'Accept')]")
                )
            )
            cookie_btn.click()
        except TimeoutException:
            pass

        # Scroll to bottom and click Gas Price Finder
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
        time.sleep(1)

        gas_link = wait.until(
            EC.presence_of_element_located((By.LINK_TEXT, "Gas Price Finder"))
        )
        driver.execute_script("arguments[0].scrollIntoView(true);", gas_link)
        time.sleep(0.5)
        driver.execute_script("arguments[0].click();", gas_link)

        # 3) On gas info page, click Find gas
        wait.until(EC.url_contains("/public-affairs/gas-information"))
        print(f"[{zip_code}] Gas info page: {driver.current_url}")

        find_btn = wait.until(
            EC.element_to_be_clickable(
                (By.XPATH, "//button[contains(., 'Find gas')]")
            )
        )
        find_btn.click()

        # 4) Wait for legacy fuel finder results page
        wait.until(lambda d: "aaa.opisnet.com" in d.current_url.lower())
        time.sleep(2)
        print(f"[{zip_code}] OPIS page: {driver.current_url}")

        html = driver.page_source
        print(f"[{zip_code}] Captured HTML")

        return html

    finally:
        driver.quit()


def parse_fuel_finder_html(html: str):
    soup = BeautifulSoup(html, "lxml")

    grid = soup.find(
        "table",
        id="ctl00_ContentPlaceHolder1_searchResults_stationList_gvResults",
    )
    if not grid:
        raise RuntimeError("Could not find station results table in HTML")

    records = []

    container = grid.find("tbody") or grid
    outer_rows = container.find_all("tr", recursive=False)

    for tr in outer_rows:
        if tr.find("th"):
            continue

        tds = tr.find_all("td", recursive=False)
        if len(tds) < 5:
            continue

        station_td = tds[0]
        addr_td = tds[1]
        reg_td = tds[2]
        dsl_td = tds[3]
        svc_td = tds[4]

        # Station
        station_name = ""
        brand = ""

        station_name_el = station_td.find("a")
        if station_name_el:
            station_name = station_name_el.get_text(strip=True)

        brand_el = station_td.select_one("span[id*='StationBrandName']")
        if brand_el:
            brand = brand_el.get_text(strip=True)

        # Address
        street = ""
        city_state_zip = ""

        street_el = addr_td.find("a")
        if street_el:
            street = street_el.get_text(strip=True)

        city_el = addr_td.select_one("span[id*='StationCityState']")
        if city_el:
            city_state_zip = " ".join(city_el.get_text(" ", strip=True).split())

        # Regular price
        reg_price = reg_td.select_one("span.CurrentPrice")
        reg_date = reg_td.select_one("span.CurrentPriceDate")
        reg_time = reg_td.select_one("span.CurrentPriceTime")

        # Diesel price
        dsl_price = dsl_td.select_one("span.CurrentPrice")
        dsl_date = dsl_td.select_one("span.CurrentPriceDate")
        dsl_time = dsl_td.select_one("span.CurrentPriceTime")

        # Services
        service_imgs = svc_td.find_all("img")
        services = ", ".join(
            img.get("title", "") for img in service_imgs if img.get("title")
        )

        if not station_name and not street:
            continue

        records.append({
            "station": station_name,
            "brand": brand,
            "street": street,
            "city_state_zip": city_state_zip,
            "regular_price": reg_price.get_text(strip=True) if reg_price else "",
            "regular_price_date": reg_date.get_text(strip=True) if reg_date else "",
            "regular_price_time": reg_time.get_text(strip=True) if reg_time else "",
            "diesel_price": dsl_price.get_text(strip=True) if dsl_price else "",
            "diesel_price_date": dsl_date.get_text(strip=True) if dsl_date else "",
            "diesel_price_time": dsl_time.get_text(strip=True) if dsl_time else "",
            "services": services,
        })

    df = pd.DataFrame(records)
    return records, df


def build_top5_from_df(df: pd.DataFrame, freshness_hours: int = 8) -> pd.DataFrame:
    if df.empty:
        return df.copy()

    df = df.copy()
    current_year = pd.Timestamp.now().year
    now = pd.Timestamp.now()

    df["regular_datetime"] = pd.to_datetime(
        df["regular_price_date"].astype(str).str.strip() + ", "
        + str(current_year) + " "
        + df["regular_price_time"].astype(str).str.strip(),
        format="%b %d, %Y %I:%M %p",
        errors="coerce"
    )

    df["regular_price_num"] = pd.to_numeric(
        df["regular_price"].astype(str).str.replace("$", "", regex=False),
        errors="coerce"
    )

    cutoff = now - pd.Timedelta(hours=freshness_hours)

    top5 = (
        df.dropna(subset=["regular_datetime", "regular_price_num"])
          .loc[lambda x: x["regular_datetime"] >= cutoff]
          .sort_values(
              by=["regular_price_num", "regular_datetime"],
              ascending=[True, False]
          )
          [[
              "station",
              "brand",
              "street",
              "city_state_zip",
              "regular_price",
              "regular_datetime",
              "diesel_price",
              "services",
          ]]
          .head(5)
          .reset_index(drop=True)
    )

    return top5


def search_aaa_by_zip_selenium(zip_code: str):
    html = open_fuel_finder(zip_code)
    stations, df = parse_fuel_finder_html(html)
    top5 = build_top5_from_df(df)
    return stations, df, top5


def run_all_zip_scrapes():
    for config in ZIP_CONFIG:
        place = config["place"]
        zip_code = config["zip_code"]
        output_path = OUTPUT_DIR / config["filename"]

        print(f"\n--- Running {place} ({zip_code}) ---")

        try:
            stations, df, top5 = search_aaa_by_zip_selenium(zip_code)

            # Optional metadata columns
            top5 = top5.copy()
            top5["search_zip"] = zip_code
            top5["place"] = place

            top5.to_csv(output_path, index=False)
            print(f"Saved {len(top5)} rows to {output_path}")

        except Exception as e:
            print(f"Failed for {place} ({zip_code}): {e}")


if __name__ == "__main__":
    run_all_zip_scrapes()