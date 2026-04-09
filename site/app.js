(function () {
  const averagesUrl = "https://raw.githubusercontent.com/CUlleryUSATRepos/BucksGasRepo/main/BucksAreaAverages/BucksAreaAverages_All.csv";
  const gasRepoBase = "https://raw.githubusercontent.com/CUlleryUSATRepos/BucksGasRepo/main/BucksGasPrices/";
  const stationRowsPerPage = 5;
  const areaRowsPerPage = 10;

  const countyAverageValue = document.getElementById("countyAverageValue");
  const weeklyChangeValue = document.getElementById("weeklyChangeValue");
  const sixMonthChangeValue = document.getElementById("sixMonthChangeValue");
  const yearlyChangeValue = document.getElementById("yearlyChangeValue");

  const placeSelect = document.getElementById("placeSelect");
  const searchInput = document.getElementById("searchInput");
  const tableStatus = document.getElementById("tableStatus");
  const tableContainer = document.getElementById("tableContainer");
  const pagination = document.getElementById("pagination");

  const areaTableStatus = document.getElementById("areaTableStatus");
  const areaTableContainer = document.getElementById("areaTableContainer");
  const areaTablePagination = document.getElementById("areaTablePagination");

  let stationRows = [];
  let filteredRows = [];
  let currentPage = 1;
  let currentPlace = "";

  let areaRows = [];
  let currentAreaPage = 1;

  function toNumber(str) {
    return parseFloat(
      String(str || "")
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .trim()
    ) || 0;
  }

  function formatCurrency(num, decimals = 3) {
    return `$${num.toFixed(decimals)}`;
  }

  function formatSignedCurrency(num, decimals = 3) {
    const sign = num > 0 ? "+" : num < 0 ? "-" : "";
    return `${sign}$${Math.abs(num).toFixed(decimals)}`;
  }

  function formatSignedPercent(num, decimals = 1) {
    const sign = num > 0 ? "+" : num < 0 ? "-" : "";
    return `${sign}${Math.abs(num).toFixed(decimals)}%`;
  }

  function getTrendClass(num) {
    if (num > 0) return "positive";
    if (num < 0) return "negative";
    return "neutral";
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function splitCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const next = line[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(current);
        current = "";
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  }

  function parseCSV(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return [];

    const lines = trimmed.split(/\r?\n/);
    if (!lines.length) return [];

    const headers = splitCSVLine(lines[0]);

    return lines.slice(1).map(line => {
      const values = splitCSVLine(line);
      const row = {};

      headers.forEach((header, i) => {
        row[header] = values[i] || "";
      });

      return row;
    });
  }

  function safeFilename(place) {
    return place.replace(/[^A-Za-z0-9]+/g, "") + "Gas.csv";
  }

  function getValidStationRows(rows) {
    return rows.filter(row => {
      const price = String(row.regular_price || "").trim();
      const time = String(row.regular_price_time || "").trim();
      return price.includes("$") && time !== "";
    });
  }

  function getAverageFromColumn(rows, columnName) {
    const values = rows
      .map(row => String(row[columnName] || "").trim())
      .filter(value => value.includes("$"))
      .map(value => toNumber(value))
      .filter(value => !Number.isNaN(value) && value > 0);

    if (!values.length) return null;

    const total = values.reduce((sum, value) => sum + value, 0);
    return total / values.length;
  }

  function renderSummaryCards(rows) {
    const currentAvg = getAverageFromColumn(rows, "area_average_price");
    const lastWeekAvg = getAverageFromColumn(rows, "area_average_last_week");
    const sixMonthsAvg = getAverageFromColumn(rows, "area_average_6_months_ago");
    const lastYearAvg = getAverageFromColumn(rows, "area_average_last_year");

    countyAverageValue.className = "summary-value summary-value-primary";
    weeklyChangeValue.className = "summary-value";
    sixMonthChangeValue.className = "summary-value";
    yearlyChangeValue.className = "summary-value";

    if (currentAvg === null) {
      countyAverageValue.textContent = "N/A";
      weeklyChangeValue.textContent = "N/A";
      sixMonthChangeValue.textContent = "N/A";
      yearlyChangeValue.textContent = "N/A";
      return;
    }

    countyAverageValue.textContent = formatCurrency(currentAvg);

    if (lastWeekAvg !== null) {
      const weeklyDiff = currentAvg - lastWeekAvg;
      weeklyChangeValue.textContent = formatSignedCurrency(weeklyDiff);
      weeklyChangeValue.className = `summary-value ${getTrendClass(weeklyDiff)}`;
    } else {
      weeklyChangeValue.textContent = "N/A";
    }

    if (sixMonthsAvg !== null && sixMonthsAvg !== 0) {
      const sixMonthPct = ((currentAvg - sixMonthsAvg) / sixMonthsAvg) * 100;
      sixMonthChangeValue.textContent = formatSignedPercent(sixMonthPct);
      sixMonthChangeValue.className = `summary-value ${getTrendClass(sixMonthPct)}`;
    } else {
      sixMonthChangeValue.textContent = "N/A";
    }

    if (lastYearAvg !== null) {
      const yearlyDiff = currentAvg - lastYearAvg;
      yearlyChangeValue.textContent = formatSignedCurrency(yearlyDiff);
      yearlyChangeValue.className = `summary-value ${getTrendClass(yearlyDiff)}`;
    } else {
      yearlyChangeValue.textContent = "N/A";
    }
  }

  async function placeHasUsableStationData(place) {
    const url = gasRepoBase + safeFilename(place);

    try {
      const response = await fetch(url + "?t=" + Date.now());
      if (!response.ok) return false;

      const csvText = await response.text();
      const parsedRows = parseCSV(csvText);
      const validRows = getValidStationRows(parsedRows);

      return validRows.length > 0;
    } catch (err) {
      console.error(`Could not check place file for ${place}`, err);
      return false;
    }
  }

  async function populatePlaceDropdown(rows) {
    const allPlaces = [...new Set(
      rows
        .map(row => String(row.search_place || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

    placeSelect.innerHTML = `<option>Loading available areas...</option>`;
    placeSelect.disabled = true;
    tableStatus.textContent = "Checking which areas currently have station updates...";

    const results = await Promise.all(
      allPlaces.map(async (place) => {
        const hasData = await placeHasUsableStationData(place);
        return hasData ? place : null;
      })
    );

    const usablePlaces = results.filter(Boolean);

    placeSelect.innerHTML = "";

    usablePlaces.forEach(place => {
      const option = document.createElement("option");
      option.value = place;
      option.textContent = place;
      placeSelect.appendChild(option);
    });

    if (!usablePlaces.length) {
      currentPlace = "";
      placeSelect.innerHTML = `<option>No available areas</option>`;
      placeSelect.disabled = true;
      tableStatus.textContent = "No areas currently have usable station data.";
      return;
    }

    if (usablePlaces.includes("Doylestown")) {
      placeSelect.value = "Doylestown";
    }

    currentPlace = placeSelect.value;
    placeSelect.disabled = false;
  }

  function filterStationRows(rows, term) {
    const q = String(term || "").trim().toLowerCase();

    if (!q) return [...rows];

    return rows.filter(row => {
      const station = String(row.station || "").toLowerCase();
      const street = String(row.street || "").toLowerCase();
      const cityStateZip = String(row.city_state_zip || "").toLowerCase();
      const price = String(row.regular_price || "").toLowerCase();

      return (
        station.includes(q) ||
        street.includes(q) ||
        cityStateZip.includes(q) ||
        price.includes(q)
      );
    });
  }

  function renderPagination() {
    const totalPages = Math.ceil(filteredRows.length / stationRowsPerPage);

    if (totalPages <= 1) {
      pagination.innerHTML = "";
      return;
    }

    pagination.innerHTML = `
      <button id="prevPageBtn" ${currentPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${currentPage} of ${totalPages}</span>
      <button id="nextPageBtn" ${currentPage === totalPages ? "disabled" : ""}>Next</button>
    `;

    document.getElementById("prevPageBtn").addEventListener("click", function () {
      if (currentPage > 1) {
        currentPage -= 1;
        renderStationTable();
      }
    });

    document.getElementById("nextPageBtn").addEventListener("click", function () {
      if (currentPage < totalPages) {
        currentPage += 1;
        renderStationTable();
      }
    });
  }

  function renderStationTable() {
    if (!filteredRows.length) {
      tableContainer.innerHTML = "<p>No gas station data available for this selection.</p>";
      pagination.innerHTML = "";
      return;
    }

    const start = (currentPage - 1) * stationRowsPerPage;
    const end = start + stationRowsPerPage;
    const pageRows = filteredRows.slice(start, end);

    let html = `
      <h3 class="table-title">Lowest gas prices in ${escapeHtml(currentPlace)} area</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Station</th>
              <th>Address</th>
              <th>Price</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
    `;

    pageRows.forEach((row, idx) => {
      const updated = [row.regular_price_date, row.regular_price_time].filter(Boolean).join(" ");
      const address = [row.street, row.city_state_zip].filter(Boolean).join(", ");
      const isFirstOverallRow = start + idx === 0;

      html += `
        <tr class="${isFirstOverallRow ? "cheapest-row" : ""}">
          <td>${escapeHtml(row.station)}</td>
          <td>${escapeHtml(address)}</td>
          <td class="price-cell">${escapeHtml(row.regular_price)}</td>
          <td>${escapeHtml(updated)}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    tableContainer.innerHTML = html;
    renderPagination();
  }

  function applySearch() {
    filteredRows = filterStationRows(stationRows, searchInput.value);
    currentPage = 1;
    renderStationTable();
  }

  async function loadPlace(place) {
    currentPlace = place;
    currentPage = 1;
    searchInput.value = "";
    tableStatus.textContent = "Loading gas prices...";
    tableContainer.innerHTML = "";
    pagination.innerHTML = "";

    const url = gasRepoBase + safeFilename(place);

    try {
      const response = await fetch(url + "?t=" + Date.now());
      if (!response.ok) {
        throw new Error("Could not load place CSV");
      }

      const csvText = await response.text();
      const parsedRows = parseCSV(csvText);

      stationRows = getValidStationRows(parsedRows);
      filteredRows = [...stationRows];

      tableStatus.textContent = "";
      renderStationTable();
    } catch (err) {
      tableStatus.textContent = "Sorry, gas prices could not be loaded right now.";
      tableContainer.innerHTML = "";
      pagination.innerHTML = "";
      console.error(err);
    }
  }

  function buildAreaRows(rows) {
    return rows
      .filter(row => {
        const place = String(row.search_place || "").trim();
        const price = String(row.area_average_price || "").trim();
        return place !== "" && price.includes("$");
      })
      .map(row => {
        const currentPrice = toNumber(row.area_average_price);
        const lastWeekPrice = toNumber(row.area_average_last_week);
        const lastMonthPrice = toNumber(row.area_average_last_month);
        const sixMonthPrice = toNumber(row.area_average_6_months_ago);
        const lastYearPrice = toNumber(row.area_average_last_year);

        const tankCurrent = toNumber(row.tank_average_cost);
        const tankLastWeek = toNumber(row.tank_average_last_week);
        const tankLastMonth = toNumber(row.tank_average_last_month);
        const tankSixMonths = toNumber(row.tank_average_6_months_ago);
        const tankLastYear = toNumber(row.tank_average_last_year);

        return {
          search_place: row.search_place || "",
          area_average_price: currentPrice,
          area_average_last_week: lastWeekPrice,
          area_average_last_month: lastMonthPrice,
          area_average_6_months_ago: sixMonthPrice,
          area_average_last_year: lastYearPrice,
          tank_average_cost: tankCurrent,
          tank_average_last_week: tankLastWeek,
          tank_average_last_month: tankLastMonth,
          tank_average_6_months_ago: tankSixMonths,
          tank_average_last_year: tankLastYear
        };
      })
      .sort((a, b) => a.tank_average_cost - b.tank_average_cost);
  }

  function renderAreaTablePagination() {
    const totalPages = Math.ceil(areaRows.length / areaRowsPerPage);

    if (totalPages <= 1) {
      areaTablePagination.innerHTML = "";
      return;
    }

    areaTablePagination.innerHTML = `
      <button id="prevAreaPageBtn" ${currentAreaPage === 1 ? "disabled" : ""}>Previous</button>
      <span>Page ${currentAreaPage} of ${totalPages}</span>
      <button id="nextAreaPageBtn" ${currentAreaPage === totalPages ? "disabled" : ""}>Next</button>
    `;

    document.getElementById("prevAreaPageBtn").addEventListener("click", function () {
      if (currentAreaPage > 1) {
        currentAreaPage -= 1;
        renderAreaTable();
      }
    });

    document.getElementById("nextAreaPageBtn").addEventListener("click", function () {
      if (currentAreaPage < totalPages) {
        currentAreaPage += 1;
        renderAreaTable();
      }
    });
  }

      function renderAreaTable() {
      if (!areaRows.length) {
        areaTableContainer.innerHTML = "<p>No area comparison data available.</p>";
        areaTablePagination.innerHTML = "";
        return;
      }

      const start = (currentAreaPage - 1) * areaRowsPerPage;
      const end = start + areaRowsPerPage;
      const pageRows = areaRows.slice(start, end);

      let html = `
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Area</th>
                <th class="numeric-cell">15-Gal Tank</th>
                <th class="numeric-cell">Last Week</th>
                <th class="numeric-cell">Last Month</th>
                <th class="numeric-cell">6 Months Ago</th>
                <th class="numeric-cell">1 Year Ago</th>
              </tr>
            </thead>
            <tbody>
      `;

      pageRows.forEach(row => {
        html += `
          <tr>
            <td class="area-name-cell">${escapeHtml(row.search_place)}</td>
            <td class="numeric-cell">${row.tank_average_cost ? formatCurrency(row.tank_average_cost, 2) : "—"}</td>
            <td class="numeric-cell">${row.tank_average_last_week ? formatCurrency(row.tank_average_last_week, 2) : "—"}</td>
            <td class="numeric-cell">${row.tank_average_last_month ? formatCurrency(row.tank_average_last_month, 2) : "—"}</td>
            <td class="numeric-cell">${row.tank_average_6_months_ago ? formatCurrency(row.tank_average_6_months_ago, 2) : "—"}</td>
            <td class="numeric-cell">${row.tank_average_last_year ? formatCurrency(row.tank_average_last_year, 2) : "—"}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;

      areaTableContainer.innerHTML = html;
      renderAreaTablePagination();
    }

  async function loadAverages() {
    try {
      const res = await fetch(averagesUrl + "?t=" + Date.now());
      if (!res.ok) throw new Error("Could not load CSV");

      const text = await res.text();
      const rows = parseCSV(text);

      if (!rows.length) {
        countyAverageValue.textContent = "N/A";
        weeklyChangeValue.textContent = "N/A";
        sixMonthChangeValue.textContent = "N/A";
        yearlyChangeValue.textContent = "N/A";
        tableStatus.textContent = "No data available.";
        areaTableStatus.textContent = "No data available.";
        areaTableContainer.innerHTML = "";
        areaTablePagination.innerHTML = "";
        return;
      }

      renderSummaryCards(rows);

      areaRows = buildAreaRows(rows);
      currentAreaPage = 1;
      areaTableStatus.textContent = "";
      renderAreaTable();

      await populatePlaceDropdown(rows);

      if (placeSelect.value && !placeSelect.disabled) {
        await loadPlace(placeSelect.value);
      }
    } catch (err) {
      countyAverageValue.textContent = "N/A";
      weeklyChangeValue.textContent = "N/A";
      sixMonthChangeValue.textContent = "N/A";
      yearlyChangeValue.textContent = "N/A";
      tableStatus.textContent = "Could not load station data.";
      areaTableStatus.textContent = "Could not load area comparison data.";
      tableContainer.innerHTML = "";
      pagination.innerHTML = "";
      areaTableContainer.innerHTML = "";
      areaTablePagination.innerHTML = "";
      console.error(err);
    }
  }

  placeSelect.addEventListener("change", function () {
    loadPlace(this.value);
  });

  searchInput.addEventListener("input", function () {
    applySearch();
  });

  loadAverages();
})();