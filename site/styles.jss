body {
  margin: 0;
  font-family: "Futura Today", Futura, Arial, sans-serif;
  background: #f5f5f5;
  color: #222;
}

.page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 40px;
}

.page-header {
  margin-bottom: 20px;
}

.page-header h1 {
  margin: 0 0 8px;
  font-size: 42px;
  line-height: 1.1;
}

.subhead {
  margin: 0;
  color: #666;
  font-size: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.card {
  background: #fff;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 18px;
  margin-bottom: 16px;
}

.summary-card {
  min-height: 126px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.summary-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 10px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.summary-value {
  font-size: 36px;
  font-weight: bold;
  line-height: 1.05;
}

.positive {
  color: #b42318;
}

.negative {
  color: #067647;
}

.neutral {
  color: #222;
}

h2 {
  margin-top: 0;
  margin-bottom: 16px;
  font-size: 28px;
}

.status {
  color: #666;
  margin-bottom: 10px;
}

.controls-row {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 16px;
  margin-bottom: 14px;
}

.control-group label {
  display: block;
  font-weight: bold;
  margin-bottom: 6px;
}

#placeSelect,
#searchInput {
  width: 100%;
  padding: 10px;
  font-size: 15px;
  box-sizing: border-box;
  font-family: "Futura Today", Futura, Arial, sans-serif;
}

.table-wrap {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 15px;
}

th {
  text-align: left;
  border-bottom: 2px solid #ccc;
  padding: 10px 8px;
  vertical-align: bottom;
  white-space: nowrap;
}

td {
  padding: 10px 8px;
  border-bottom: 1px solid #e5e5e5;
  vertical-align: top;
}

.cheapest-row {
  background: #fdf6d8;
}

.price-cell {
  font-weight: bold;
}

.numeric-cell {
  text-align: right;
  white-space: nowrap;
}

.area-name-cell {
  font-weight: bold;
  white-space: nowrap;
}

#pagination,
#areaTablePagination {
  margin-top: 12px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

#pagination button,
#areaTablePagination button {
  padding: 6px 10px;
  font-size: 14px;
  cursor: pointer;
  font-family: "Futura Today", Futura, Arial, sans-serif;
}

#pagination button:disabled,
#areaTablePagination button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

@media (max-width: 1000px) {
  .summary-grid {
    grid-template-columns: 1fr 1fr;
  }

  .controls-row {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .page-header h1 {
    font-size: 34px;
  }

  .summary-value {
    font-size: 30px;
  }

  h2 {
    font-size: 24px;
  }
}