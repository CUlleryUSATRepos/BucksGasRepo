from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from bs4 import BeautifulSoup
import pandas as pd
import time
import os
import re


START_URL = "https://www.aaa.com/stop/"
ZIP_CODE = "18901"

OUTPUT_FOLDER = "BucksGasPrices"
AVERAGES_FOLDER = "BucksAreaAverages"
COMBINED_AVERAGES_FILE = "BucksAreaAverages_All.csv"

approved_bucks_places = [
    "Bensalem","Bristol","Chalfont","Churchville","Croydon","Doylestown","Dublin",
    "Fairless Hills","Ferndale","Hulmeville","Ivyland","Jamestown","Langhorne",
    "Levittown","Mechanicsville","Morrisville","New Hope","Newtown","Newtown Grant",
    "Penndel","Perkasie","Quakertown","Richboro","Richlandtown","Riegelsville",
    "Sellersville","Telford","Village Shires","Warminster","Warminster Heights",
    "Woodbourne","Woodside","Yardley"
]


def safe_filename(place_name: str, suffix: str = "Gas.csv") -> str:
    cleaned = re.sub(r"[^A-Za-z0-9]+", "", place_name)
    return f"{cleaned}{suffix}"


def empty_results_df():
    return pd.DataFrame(columns=[
        "search_place","station","brand","street","city_state_zip",
        "regular_price","regular_price_date","regular_price_time",
        "diesel_price","diesel_price_date","diesel_price_time","services"
    ])


def empty_averages_df():
    return pd.DataFrame(columns=[
        "search_place",
        "area_average_price",
        "area_average_last_week",
        "area_average_last_month",
        "area_average_6_months_ago",
        "area_average_last_year",
        "tank_average_cost",
        "tank_average_last_week",
        "tank_average_last_month",
        "tank_average_6_months_ago",
        "tank_average_last_year"
    ])


def parse_fuel_finder_html(html: str):
    soup = BeautifulSoup(html, "lxml")

    grid = soup.find(
        "table",
        id="ctl00_ContentPlaceHolder1_searchResults_stationList_gvResults",
    )

    if not grid:
        return empty_results_df()

    records = []
    rows = (grid.find("tbody") or grid).find_all("tr", recursive=False)

    for tr in rows:
        if tr.find("th"):
            continue

        tds = tr.find_all("td", recursive=False)
        if len(tds) < 5:
            continue

        station_td, addr_td, reg_td, dsl_td, svc_td = tds

        def get_text(el):
            return el.get_text(strip=True) if el else ""

        station = get_text(station_td.find("a"))
        brand = get_text(station_td.select_one("span[id*='StationBrandName']"))
        street = get_text(addr_td.find("a"))

        city_el = addr_td.select_one("span[id*='StationCityState']")
        city = " ".join(city_el.get_text(" ", strip=True).split()) if city_el else ""

        reg_price = get_text(reg_td.select_one("span.CurrentPrice"))
        reg_date = get_text(reg_td.select_one("span.CurrentPriceDate"))
        reg_time = get_text(reg_td.select_one("span.CurrentPriceTime"))

        dsl_price = get_text(dsl_td.select_one("span.CurrentPrice"))
        dsl_date = get_text(dsl_td.select_one("span.CurrentPriceDate"))
        dsl_time = get_text(dsl_td.select_one("span.CurrentPriceTime"))

        services = ", ".join(
            img.get("title", "") for img in svc_td.find_all("img") if img.get("title")
        )

        if not station and not street:
            continue

        records.append({
            "search_place": "",
            "station": station,
            "brand": brand,
            "street": street,
            "city_state_zip": city,
            "regular_price": reg_price,
            "regular_price_date": reg_date,
            "regular_price_time": reg_time,
            "diesel_price": dsl_price,
            "diesel_price_date": dsl_date,
            "diesel_price_time": dsl_time,
            "services": services,
        })

    return pd.DataFrame(records)


def parse_area_averages_html(html: str, place_name: str):
    soup = BeautifulSoup(html, "lxml")

    def text_by_id(element_id: str) -> str:
        el = soup.find(id=element_id)
        return el.get_text(strip=True) if el else ""

    record = {
        "search_place": place_name,
        "area_average_price": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_aaaMap_todayAvgLB"
        ),
        "area_average_last_week": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_aaaMap_weekAgoAvgLB"
        ),
        "area_average_last_month": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_aaaMap_monthAgoAvgLB"
        ),
        "area_average_6_months_ago": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_aaaMap_halfYearsAgoAvgLB"
        ),
        "area_average_last_year": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_aaaMap_yearAgoAvgLB"
        ),
        "tank_average_cost": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_stationList_todayAvgLB"
        ),
        "tank_average_last_week": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_stationList_weekAgoAvgLB"
        ),
        "tank_average_last_month": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_stationList_monthAgoAvgLB"
        ),
        "tank_average_6_months_ago": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_stationList_halfYearsAgoAvgLB"
        ),
        "tank_average_last_year": text_by_id(
            "ctl00_ContentPlaceHolder1_searchResults_stationList_yearAgoAvgLB"
        ),
    }

    # If absolutely nothing was found, still return a 1-row dataframe so the place exists in output
    return pd.DataFrame([record])


def open_driver():
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=options)
    wait = WebDriverWait(driver, 20)
    return driver, wait


def navigate_to_fuel_finder(driver, wait):
    driver.get(START_URL)

    wait.until(EC.presence_of_element_located((By.ID, "zipCode"))).send_keys(ZIP_CODE)
    wait.until(EC.element_to_be_clickable((By.ID, "goButton"))).click()

    wait.until(lambda d: "cluballiance.aaa.com" in d.current_url.lower())

    try:
        WebDriverWait(driver, 5).until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(., 'Accept')]"))
        ).click()
    except Exception:
        pass

    driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    time.sleep(1)

    gas_link = wait.until(
        EC.presence_of_element_located((By.LINK_TEXT, "Gas Price Finder"))
    )
    driver.execute_script("arguments[0].click();", gas_link)

    wait.until(EC.url_contains("gas-information"))

    wait.until(
        EC.element_to_be_clickable(
            (By.XPATH, "//button[contains(., 'Find gas')]")
        )
    ).click()

    wait.until(lambda d: "aaa.opisnet.com" in d.current_url.lower())


def select_state_pa(driver, wait):
    Select(
        wait.until(
            EC.presence_of_element_located(
                (By.ID, "ctl00_ContentPlaceHolder1_aaaSearch_ddState")
            )
        )
    ).select_by_value("PA")

    wait.until(
        lambda d: len(
            Select(
                d.find_element(By.ID, "ctl00_ContentPlaceHolder1_aaaSearch_ddCity")
            ).options
        ) > 1
    )


def wait_for_search_outcome(driver, timeout=6):
    end = time.time() + timeout
    while time.time() < end:
        page = driver.page_source
        if "searchResults_stationList" in page or "avgBoxTop" in page or "avgBoxBottom" in page:
            return "table"
        time.sleep(0.4)
    return "no_table"


def search_and_scrape(driver, wait, place):
    Select(
        wait.until(
            EC.presence_of_element_located(
                (By.ID, "ctl00_ContentPlaceHolder1_aaaSearch_ddCity")
            )
        )
    ).select_by_value(place)

    wait.until(
        EC.element_to_be_clickable(
            (By.ID, "ctl00_ContentPlaceHolder1_aaaSearch_btnSearch")
        )
    ).click()

    outcome = wait_for_search_outcome(driver)
    html = driver.page_source

    if outcome == "table":
        station_df = parse_fuel_finder_html(html)
        station_df["search_place"] = place

        averages_df = parse_area_averages_html(html, place)
        return station_df, averages_df, "table"

    station_df = empty_results_df()
    averages_df = empty_averages_df()

    if station_df.empty:
        station_df = pd.DataFrame(columns=station_df.columns)

    averages_df = pd.DataFrame([{
        "search_place": place,
        "area_average_price": "",
        "area_average_last_week": "",
        "area_average_last_month": "",
        "area_average_6_months_ago": "",
        "area_average_last_year": "",
        "tank_average_cost": "",
        "tank_average_last_week": "",
        "tank_average_last_month": "",
        "tank_average_6_months_ago": "",
        "tank_average_last_year": ""
    }])

    return station_df, averages_df, "no_table"


def return_to_search(driver, wait):
    try:
        driver.find_element(By.XPATH, "//a[contains(@href,'history.back')]").click()
    except Exception:
        driver.back()

    wait.until(
        EC.presence_of_element_located(
            (By.ID, "ctl00_ContentPlaceHolder1_aaaSearch_ddCity")
        )
    )


def main():
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    os.makedirs(AVERAGES_FOLDER, exist_ok=True)

    driver, wait = open_driver()
    results = []
    combined_average_rows = []

    try:
        navigate_to_fuel_finder(driver, wait)
        select_state_pa(driver, wait)

        for i, place in enumerate(approved_bucks_places):
            try:
                station_df, averages_df, outcome = search_and_scrape(driver, wait, place)
                station_df = station_df[
                    station_df["regular_price"].astype(str).str.contains(r"\$", na=False) &
                    station_df["city_state_zip"].astype(str).str.contains(place, case=False, na=False, regex=False)
                    ].copy()

                gas_path = os.path.join(OUTPUT_FOLDER, safe_filename(place, "Gas.csv"))
                station_df.to_csv(gas_path, index=False)

                avg_path = os.path.join(AVERAGES_FOLDER, safe_filename(place, "Averages.csv"))
                averages_df.to_csv(avg_path, index=False)

                combined_average_rows.append(averages_df)

                results.append({
                    "place_name": place,
                    "success": True,
                    "outcome": outcome,
                    "row_count": len(station_df)
                })

            except Exception as e:
                error_avg = pd.DataFrame([{
                    "search_place": place,
                    "area_average_price": "",
                    "area_average_last_week": "",
                    "area_average_last_month": "",
                    "area_average_6_months_ago": "",
                    "area_average_last_year": "",
                    "tank_average_cost": "",
                    "tank_average_last_week": "",
                    "tank_average_last_month": "",
                    "tank_average_6_months_ago": "",
                    "tank_average_last_year": ""
                }])

                avg_path = os.path.join(AVERAGES_FOLDER, safe_filename(place, "Averages.csv"))
                error_avg.to_csv(avg_path, index=False)
                combined_average_rows.append(error_avg)

                results.append({
                    "place_name": place,
                    "success": False,
                    "outcome": "error",
                    "row_count": 0,
                    "error_message": str(e)
                })

            if i < len(approved_bucks_places) - 1:
                return_to_search(driver, wait)

        pd.DataFrame(results).to_csv(
            os.path.join(OUTPUT_FOLDER, "scrape_summary.csv"),
            index=False
        )

        if combined_average_rows:
            combined_averages = pd.concat(combined_average_rows, ignore_index=True)
            combined_averages.to_csv(
                os.path.join(AVERAGES_FOLDER, COMBINED_AVERAGES_FILE),
                index=False
            )

        print("Run complete.")
        print(f"Gas station files written to {OUTPUT_FOLDER}/")
        print(f"Area average files written to {AVERAGES_FOLDER}/")

    finally:
        driver.quit()


if __name__ == "__main__":
    start = time.perf_counter()

    main()

    total = time.perf_counter() - start
    print(f"TOTAL RUNTIME: {int(total // 60)} min {int(total % 60)} sec")