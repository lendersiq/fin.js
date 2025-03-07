(() => {
  // 1) Validate appConfig
  if (!appConfig || !Array.isArray(appConfig)) {
    console.error("appConfig is not defined or is not an array.");
    return;
  }

  // 2) Identify the unique column config (exactly one assumed)
  const uniqueConfig = appConfig.find(
    cfg => cfg.column_type === "data" && cfg.data_type === "unique"
  );
  if (!uniqueConfig) {
    console.error("No unique column configuration found (data_type = 'unique').");
    return;
  }
  const uniqueColumn = uniqueConfig.id; // e.g. "Portfolio"

  // 3) Prepare global data structures
  window.rawData = {};      // rawData[sourceName] => array of filtered rows
  window.combinedData = {}; // combined object keyed by unique column

  // 4) Gather unique source names
  const uniqueSources = [
    ...new Set(
      appConfig
        .map(cfg => cfg.source_name)
        .filter(Boolean)
    )
  ];

  // We'll track how many sources are loaded to know when to combine
  let loadedCount = 0;

  // 5) Build a very basic modal
  const modalBackdrop = document.createElement("div");
  Object.assign(modalBackdrop.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0, 0, 0, 0.4)",
    zIndex: "9999",
  });

  const modal = document.createElement("div");
  Object.assign(modal.style, {
    background: "#fff",
    padding: "1rem",
    borderRadius: "5px",
    width: "300px",
    maxHeight: "80vh",
    overflowY: "auto",
  });

  const title = document.createElement("h2");
  title.textContent = "Upload CSV Files";
  modal.appendChild(title);

  // 6) For each source, create a file input
  uniqueSources.forEach(sourceName => {
    const label = document.createElement("label");
    label.textContent = `Select CSV for: ${sourceName}`;

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv";

    fileInput.addEventListener("change", evt => {
      const file = evt.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        const csvContent = e.target.result;

        // 6.1) Identify relevant config columns for this source
        const relevantConfigItems = appConfig.filter(
          c => c.source_name === sourceName && c.column_type === "data"
        );
        // The columns' IDs
        const relevantColumns = relevantConfigItems.map(c => c.id);
        // Always ensure the unique column is included
        if (!relevantColumns.includes(uniqueColumn)) {
          relevantColumns.push(uniqueColumn);
        }

        // 6.2) Parse the CSV
        const parsedRows = parseCSV(csvContent);

        // 6.3) Filter out columns not in relevantColumns
        const filteredRows = parsedRows.map(row => {
          const newRow = {};
          relevantColumns.forEach(col => {
            if (row.hasOwnProperty(col)) {
              newRow[col] = row[col];
            }
          });
          return newRow;
        });

        // 6.4) Store the result
        window.rawData[sourceName] = filteredRows;
        console.log(`Loaded CSV for "${sourceName}":`, filteredRows);

        // 6.5) Increment loadedCount. If all done, combine data
        loadedCount++;
        if (loadedCount === uniqueSources.length) {
          combineData();
        }
      };
      reader.readAsText(file);
    });

    // Add to modal
    label.appendChild(document.createElement("br"));
    label.appendChild(fileInput);
    modal.appendChild(label);
    modal.appendChild(document.createElement("hr"));
  });

  // "Done" button to close the modal
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "Done";
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(modalBackdrop);
  });
  modal.appendChild(closeBtn);

  modalBackdrop.appendChild(modal);
  document.body.appendChild(modalBackdrop);

  // 7) CSV parser
  function parseCSV(csvString) {
    const lines = csvString
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return [];

    const headers = lines[0].split(",").map(h => h.trim());
    const dataRows = lines.slice(1);

    return dataRows.map(row => {
      const values = row.split(",");
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx] ? values[idx].trim() : "";
      });
      return obj;
    });
  }

  // Example formatValue function
  const currencyFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });
  const integerFormatter = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  });
  const floatFormatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });

  function formatValue(value, dataType) {
    if (value == null || value === "") {
      return "";
    }

    switch (dataType) {
      case "currency":
        {
          const parsedCurrency = parseFloat(value);
          return isNaN(parsedCurrency)
            ? value
            : currencyFormatter.format(parsedCurrency);
        }
      case "integer":
        {
          const parsedInt = parseInt(value, 10);
          return isNaN(parsedInt) ? value : integerFormatter.format(parsedInt);
        }
      case "float":
        {
          const parsedFloat = parseFloat(value);
          return isNaN(parsedFloat) ? value : floatFormatter.format(parsedFloat);
        }
      // Add your date formatting if needed:
      // case 'date':
      //   ...

      default:
        // 'unique', string, or fallback
        return value;
    }
  }

  // 8) Combine data across sources into window.combinedData
  //    Instead of storing a single object, we store:
  //    {
  //       [uniqueVal]: {
  //         subRows: [...],
  //         totals: {... aggregated fields ...}
  //       }
  //    }
  function combineData() {
    // Start fresh
    window.combinedData = {};

    // Gather all sub-rows
    Object.keys(window.rawData).forEach(sourceName => {
      const rows = window.rawData[sourceName];
      rows.forEach(row => {
        const uniqueValue = row[uniqueColumn];
        if (!uniqueValue) return; // skip if missing the unique ID

        if (!window.combinedData[uniqueValue]) {
          // subRows = array of all raw entries for that uniqueValue
          window.combinedData[uniqueValue] = {
            subRows: [],
            totals: {}, // will compute later
          };
        }
        window.combinedData[uniqueValue].subRows.push(row);
      });
    });

    // Compute aggregates (totals) for each uniqueValue
    Object.keys(window.combinedData).forEach(uniqueVal => {
      const entry = window.combinedData[uniqueVal];
      const subRows = entry.subRows;

      // If there's only 1 sub-row, just copy it directly to totals
      if (subRows.length === 1) {
        entry.totals = { ...subRows[0] };
      } else {
        // We have multiple sub-rows, so compute aggregated fields 
        // according to each column's data_type.
        entry.totals = computeAggregates(subRows);
      }
    });

    // 8.1) Apply filters if needed (on the aggregated data, if that’s your intention)
    applyFilters();

    console.log("Combined (with subRows) data:", window.combinedData);

    // Build the final table
    buildTable();
  }

  /**
   * Compute aggregated values across multiple subRows.
   * - currency/float => sum
   * - integer => mode (most frequently occurring)
   * - date => earliest date
   * - string => comma-delimited list of distinct values
   * - unique => pick the first (or any) row’s unique for clarity
   */
  function computeAggregates(subRows) {
    // Start an empty aggregator
    const totals = {};

    // For each column in appConfig, gather all values from subRows
    appConfig.forEach(cfg => {
      if (cfg.column_type !== "data") return; // skip non-data
      const colId = cfg.id;
      const colType = cfg.data_type;

      // Gather all non-empty values from subRows
      const values = subRows
        .map(r => (r[colId] !== undefined ? r[colId] : ""))
        .filter(v => v !== "");

      if (values.length === 0) {
        totals[colId] = "";
        return;
      }

      switch (colType) {
        case "unique":
          // Just set the unique column to the first row’s value
          // (they should all be the same for a given uniqueVal)
          totals[colId] = values[0];
          break;

        case "currency":
        case "float":
          // Sum them up
          const floatSum = values.reduce((acc, val) => {
            const parsed = parseFloat(val);
            return isNaN(parsed) ? acc : acc + parsed;
          }, 0);
          totals[colId] = floatSum.toString();
          break;

        case "integer":
          // Find the mode
          const freq = {};
          values.forEach(v => {
            // parse integer
            const parsed = parseInt(v, 10);
            // If not numeric, skip
            if (!isNaN(parsed)) {
              freq[parsed] = (freq[parsed] || 0) + 1;
            }
          });
          // Identify the integer with the highest frequency
          let maxCount = -Infinity;
          let modeValue = "";
          Object.keys(freq).forEach(k => {
            if (freq[k] > maxCount) {
              modeValue = k;
              maxCount = freq[k];
            }
          });
          totals[colId] = modeValue;
          break;

        case "date":
          // Earliest date
          // parse them as date objects; find the min
          // (If you want more robust date parsing, adjust accordingly)
          const dates = values
            .map(v => new Date(v)) // might need to parse with moment or custom
            .filter(d => !isNaN(d.valueOf())); 
          if (dates.length === 0) {
            totals[colId] = "";
          } else {
            const earliest = new Date(Math.min(...dates));
            totals[colId] = earliest.toISOString().split("T")[0];
          }
          break;

        default:
          // If string or anything else, we store distinct values as a list
          const distinct = [...new Set(values)];
          totals[colId] = distinct.join(", ");
          break;
      }
    });

    return totals;
  }

  // 9) Apply filters from appConfig to combinedData
  function applyFilters() {
    // 9.1) Collect all configs with a filter
    const filterConfigs = appConfig.filter(
      c => c.filter && c.column_type === "data"
    );
    if (filterConfigs.length === 0) return; // No filters, do nothing

    // 9.2) Build an array of { column, fn } so we can quickly evaluate each row
    const parsedFilters = filterConfigs.map(cfg => {
      return {
        column: cfg.id,
        apply: createFilterFn(cfg.filter, cfg.data_type),
      };
    });

    // 9.3) For each uniqueVal in combinedData, check if it passes all filters
    Object.keys(window.combinedData).forEach(uniqueVal => {
      const totalsRow = window.combinedData[uniqueVal].totals;
      let keep = true;

      for (const filterObj of parsedFilters) {
        const col = filterObj.column;
        const val = totalsRow[col];
        if (!filterObj.apply(val)) {
          // If any filter fails, remove this entry and break
          keep = false;
          break;
        }
      }

      if (!keep) {
        delete window.combinedData[uniqueVal];
      }
    });
  }

  // 10) Create a function that returns a boolean test
  //     based on a filter string. 
  //     Examples:
  //      - "[20]" => pass if value === 20
  //      - "[10,20]" => pass if value is 10 or 20
  //      - "==20" => pass if value == 20
  //      - ">100" => pass if value > 100
  //     Etc.
  function createFilterFn(filter, dataType) {
    filter = filter.trim();

    // Helper: convert string to typed value
    function convert(val) {
      if (dataType === "integer" || dataType === "float" || dataType === "currency") {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? val : parsed;
      }
      return val;
    }

    // 10.1) Array syntax [10,20]
    if (/^\[.*\]$/.test(filter)) {
      let arr;
      try {
        arr = JSON.parse(filter); // e.g. "[10,20]" => [10, 20]
      } catch (e) {
        console.error("Failed to parse array filter:", filter, e);
        return () => true;
      }
      return rawValue => {
        const actualValue = convert(rawValue);
        return arr.includes(actualValue);
      };
    }

    // 10.2) Comparison syntax "==20", ">=100", "<10", etc.
    const comparisonPattern = /^(==|!=|>=|<=|>|<)\s*(.*)$/;
    const match = filter.match(comparisonPattern);
    if (match) {
      const operator = match[1];
      const operandStr = match[2].trim();
      return rawValue => {
        const leftVal = convert(rawValue);
        const rightVal = convert(operandStr);
        switch (operator) {
          case "==": return leftVal == rightVal;
          case "!=": return leftVal != rightVal;
          case ">":  return leftVal > rightVal;
          case "<":  return leftVal < rightVal;
          case ">=": return leftVal >= rightVal;
          case "<=": return leftVal <= rightVal;
          default:
            return true;
        }
      };
    }

    // Otherwise, unrecognized filter pattern
    console.warn("Unrecognized filter pattern:", filter);
    return () => true;
  }

  // 11) Finally, build the HTML table showing aggregated totals
  //     plus sub-rows (if more than 1).
  function buildTable() {
    const tableContainer = document.createElement("div");
    const table = document.createElement("table");
    table.className = "table";

    // Table header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    appConfig.forEach(col => {
      if (col.column_type !== "data") return;
      const th = document.createElement("th");
      th.innerText = col.heading;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement("tbody");

    Object.keys(window.combinedData).forEach(uniqueVal => {
      const entry = window.combinedData[uniqueVal];
      if (!entry) return; // might have been deleted by filter

      const { subRows, totals } = entry;

      // Build "totals" row
      const totalsRow = document.createElement("tr");
      // We'll give it a data attribute to toggle sub-rows
      if (subRows.length > 1) {
        totalsRow.style.cursor = "pointer";
        totalsRow.setAttribute("data-toggle", uniqueVal);
      }

      appConfig.forEach(col => {
        if (col.column_type !== "data") return;
        const td = document.createElement("td");
        const rawValue = totals[col.id];
        const formattedValue = formatValue(rawValue, col.data_type);
        td.innerText = formattedValue;
        totalsRow.appendChild(td);
      });

      tbody.appendChild(totalsRow);

      // If there's more than one sub-row, we create hidden rows
      if (subRows.length > 1) {
        subRows.forEach((rawRow, index) => {
          // Each sub-row
          const subTr = document.createElement("tr");
          // Hide by default
          subTr.style.display = "none";
          // Use a class or data attribute to identify it
          subTr.classList.add(`subrow-${uniqueVal}`);

          appConfig.forEach(col => {
            if (col.column_type !== "data") return;
            const subTd = document.createElement("td");
            const rawValue = rawRow[col.id];
            const formattedValue = formatValue(rawValue, col.data_type);
            subTd.innerText = formattedValue;
            subTr.appendChild(subTd);
          });

          tbody.appendChild(subTr);
        });
      }
    });

    table.appendChild(tbody);
    tableContainer.appendChild(table);
    document.body.appendChild(tableContainer);

    // Add a click handler to toggle sub-rows
    table.addEventListener("click", e => {
      // Did we click on a row with data-toggle?
      const tr = e.target.closest("tr[data-toggle]");
      if (!tr) return;
      const key = tr.getAttribute("data-toggle");
      // Toggle all .subrow-[key]
      const subRows = table.querySelectorAll(`.subrow-${key}`);
      subRows.forEach(subTr => {
        if (subTr.style.display === "none") {
          subTr.style.display = "";
        } else {
          subTr.style.display = "none";
        }
      });
    });
  }
})();
