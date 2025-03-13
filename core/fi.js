(() => {
  // 1) Validate appConfig
  if (!appConfig || !Array.isArray(appConfig)) {
    console.error("appConfig is not defined or is not an array.");
    return;
  }

  const loadScript = (src, callback) => {
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.onload = callback; // Trigger callback when the script is loaded
    document.head.appendChild(script);
  };

  const asciiFIjs = `
  FFFFFFF  IIIIIII         j    ssss
  F           I            j   s    
  FFFFFF      I            j    sss 
  F           I     ..  j  j       s
  F        IIIIIII  ..   jjj   ssss
  `;

  console.log(asciiFIjs);

  // Load scripts in the correct order
  loadScript("../../libraries/financial.js", () => {
    console.log("libraries/financial.js loaded");
  });
  renderFavicon();

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
  modalBackdrop.id = "modalBackdrop";
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
    padding: "0",
    borderRadius: "5px",
    width: "400px",
    maxHeight: "80vh",
    overflowY: "auto",
  });
  const modalHeader = document.createElement("div");
  modalHeader.classList.add("modal-header");
  const closeButton = document.createElement("button");
  closeButton.classList.add("close-button")
  closeButton.ariaLabel = "Close Modal";
  closeButton.innerHTML = "&times;";
  closeButton.addEventListener("click", () => {
    document.body.removeChild(modalBackdrop);
  });

  modalHeader.appendChild(closeButton);
  modal.appendChild(modalHeader);
  const modalContent = document.createElement("div");
  modalContent.classList.add("modal-content");
  const modalHero = document.createElement('span');
  modalHero.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 200 200">
      <!-- Bottom rotated square -->
      <g transform="rotate(45, 100, 100)">
        <rect x="35" y="35" width="130" height="130" fill="#0b3260" opacity="0.75" />
        <text x="100" y="135" font-family="Arial, sans-serif" font-size="90" fill="#ffffff" text-anchor="middle" >
          JS
        </text>
      </g>
      <!-- Top square -->
      <g>
        <rect x="35" y="35" width="130" height="130" fill="#0b6031" opacity="0.65" />
        <text x="100" y="130" font-family="Arial, sans-serif" font-size="80" fill="#ffffff" text-anchor="middle">
          FI
        </text>
      </g>
    </svg>`;
  modalContent.appendChild(modalHero);

  const instructions = document.createElement('p');
  instructions.textContent = 'Select data from the secure source.';
  modalContent.appendChild(instructions);

  // For each source, create a file input
  uniqueSources.forEach(sourceName => {
    const label = document.createElement("label");
    label.textContent = `Choose ${sourceName} Source`;
    label.classList.add("custom-file-upload");

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".csv";
    fileInput.classList.add("hidden-file-input");

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

        // statistics of filtered dataset(s) 
        window.statistics = window.statistics || {};
        window.statistics[sourceName] = computeStatistics(filteredRows);

        console.log(`Loaded CSV for "${sourceName}":`, filteredRows);

        // 6.5) Increment loadedCount. If all done, combine data
        loadedCount++;
        if (loadedCount === uniqueSources.length) {
          // *load done*
          const modalBackdrop = document.getElementById("modalBackdrop");
          document.body.removeChild(modalBackdrop);
          console.log('statistics', window.statistics);
          // Once all CSVs are loaded, combine
          combineData();
          // Then apply functions and formulas
          applyFunctionsAndFormulas();
          // Finally build the table
          buildTable();
        }
      };
      reader.readAsText(file);
    });

    label.appendChild(document.createElement("br"));
    label.appendChild(fileInput);
    modalContent.appendChild(label);
  });
  modal.appendChild(modalContent)
  modalBackdrop.appendChild(modal);
  document.body.appendChild(modalBackdrop);

  // --- CSV parser ---
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

  // Example formatValue function for display
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
      case "currency": {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? value : currencyFormatter.format(parsed);
      }
      case "integer": {
        const parsed = parseInt(value, 10);
        return isNaN(parsed) ? value : integerFormatter.format(parsed);
      }
      case "float":
      case "rate": {
        const parsed = parseFloat(value);
        return isNaN(parsed) ? value : floatFormatter.format(parsed);
      }
      default:
        return value;
    }
  }

  // --- Combine data across sources into window.combinedData ---
  function combineData() {
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
            totals: {},
          };
        }
        window.combinedData[uniqueValue].subRows.push(row);
      });
    });
 

    // Simple aggregator to get initial "totals" for each uniqueVal
    // We'll re-run aggregator after we apply functions/formulas too.
    Object.keys(window.combinedData).forEach(uniqueVal => {
      const entry = window.combinedData[uniqueVal];
      const subRows = entry.subRows;
      
      if (subRows.length === 1) {
        entry.totals = { ...subRows[0] };
      } else {
        entry.totals = computeAggregates(subRows);
      }
    });
    // Apply filters from appConfig (on totals if desired)
    applyFilters();

    console.log("Combined data (with subRows):", window.combinedData);
  }

  /**
   * Aggregation logic for columns with column_type in ["data","function","formula"].
   * We rely on `data_type` (e.g. "currency", "integer", "float", "rate", etc.) 
   * to decide how to aggregate.
   */
  function computeAggregates(rows) {
    const totals = {};

    // Gather *all* columns that we want to aggregate 
    // (data, function, formula). We skip "unique" only if we want 1 value
    // or handle it separately in the logic below.
    const aggregatableCols = appConfig.filter(cfg =>
      ["data", "function", "formula"].includes(cfg.column_type)
    );

    aggregatableCols.forEach(cfg => {
      const colId = cfg.id;
      const colType = cfg.data_type; 

      // Gather all values from these rows
      const values = rows
        .map(r => (r[colId] !== undefined ? r[colId] : ""))
        .filter(v => v !== "");

      if (values.length === 0) {
        totals[colId] = "";
        return;
      }

      switch (colType) {
        case "unique":
          // They should all be the same for this unique ID, but let's just pick first
          totals[colId] = values[0];
          break;

        case "currency":
        case "float":
        case "rate": {
          // sum them
          let sum = 0;
          values.forEach(val => {
            const parsed = parseFloat(val);
            if (!isNaN(parsed)) sum += parsed;
          });
          totals[colId] = sum.toString();
          break;
        }

        case "integer": {
          // find mode
          const freq = {};
          values.forEach(v => {
            const parsed = parseInt(v, 10);
            if (!isNaN(parsed)) {
              freq[parsed] = (freq[parsed] || 0) + 1;
            }
          });
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
        }

        case "date": {
          // find earliest date
          let earliest = null;
          values.forEach(dateStr => {
            const d = new Date(dateStr);
            if (!isNaN(d.getTime())) { // valid date check
              if (earliest === null || d < earliest) {
                earliest = d;
              }
            }
          });
          // Convert to ISO string or another preferred date format if a valid date was found
          totals[colId] = earliest ? earliest.toISOString().split('T')[0] : "";
          break;
        }

        default:
          // string => distinct
          const distinct = [...new Set(values)];
          totals[colId] = distinct.join(", ");
          break;
      }
    });

    return totals;
  }

  // --- Apply any filters defined in appConfig ---
  function applyFilters() {
    const filterConfigs = appConfig.filter(
      c => c.filter && c.column_type === "data"
    );
    if (!filterConfigs.length) return;

    const parsedFilters = filterConfigs.map(cfg => {
      return {
        column: cfg.id,
        fn: createFilterFn(cfg.filter, cfg.data_type)
      };
    });

    Object.keys(window.combinedData).forEach(uniqueVal => {
      const { totals } = window.combinedData[uniqueVal];
      let keep = true;
      for (const filterObj of parsedFilters) {
        const col = filterObj.column;
        const val = totals[col];
        if (!filterObj.fn(val)) {
          keep = false;
          break;
        }
      }
      if (!keep) {
        delete window.combinedData[uniqueVal];
      }
    });
  }

  function createFilterFn(filter, dataType) {
    filter = filter.trim();

    function convert(val) {
      if (["integer","float","currency","rate"].includes(dataType)) {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? val : parsed;
      }
      return val;
    }

    // Array syntax: [20,30]
    if (/^\[.*\]$/.test(filter)) {
      let arr;
      try {
        arr = JSON.parse(filter); // e.g. "[10,20]" => [10, 20]
      } catch (e) {
        console.error("Failed to parse array filter:", filter, e);
        return () => true;
      }
      return (rawValue) => {
        const actual = convert(rawValue);
        return arr.includes(actual);
      };
    }

    // Comparison: ==, !=, >, >=, <, <=
    const comparison = /^(==|!=|>=|<=|>|<)\s*(.*)$/;
    const match = filter.match(comparison);
    if (match) {
      const operator = match[1];
      const rightStr = match[2].trim();
      return (rawValue) => {
        const leftVal = convert(rawValue);
        const rightVal = convert(rightStr);
        switch (operator) {
          case "==": return leftVal == rightVal;
          case "!=": return leftVal != rightVal;
          case ">":  return leftVal >  rightVal;
          case "<":  return leftVal <  rightVal;
          case ">=": return leftVal >= rightVal;
          case "<=": return leftVal <= rightVal;
          default:   return true;
        }
      };
    }

    console.warn("Unrecognized filter:", filter);
    return () => true;
  }

  /*************************************************************
   *  APPLY FUNCTION AND FORMULA COLUMNS
   *************************************************************/
  function applyFunctionsAndFormulas() {
    let count = 0;
    let uniqueCount = 0;
    // Grab function and formula columns from the config
    const functionCols = appConfig.filter(c => c.column_type === "function");
    const formulaCols  = appConfig.filter(c => c.column_type === "formula");

    // For each unique entry in combinedData, apply these columns
    const allKeys = Object.keys(window.combinedData);
    allKeys.forEach(key => {
      const entry = window.combinedData[key];
      if (!entry) return;
      count += entry.subRows.length;
      uniqueCount += 1;

      // Apply to each subRow
      entry.subRows.forEach(row => {
        applyFunctionCols(row, functionCols);
        applyFormulaCols(row, formulaCols);
      });

      // Re-aggregate so "totals" reflect new columns
      entry.totals = computeAggregates(entry.subRows);

      // Then also apply function/formula to the newly updated totals (optional)
      applyFunctionCols(entry.totals, functionCols);
      applyFormulaCols(entry.totals, formulaCols);
    });

    window.statistics['filtered'] = window.statistics['filtered'] || {};
    window.statistics['filtered'].count = count;
    window.statistics['filtered'].unique = uniqueCount;
    console.log("Applied functions & formulas:", window.combinedData);
  }

  function applyFunctionCols(row, functionCols) {
    functionCols.forEach(col => {
      const fnCall = col.function || "";
      // e.g. "interestIncome(principal, rate)"
      const match = fnCall.match(/^(\w+)\s*\(([^)]*)\)\s*$/);
      if (!match) {
        console.warn("Invalid function definition:", fnCall);
        return;
      }
      const funcName = match[1];
      const argNames = match[2].split(",").map(a => a.trim()).filter(Boolean);

      if (
        !window.financial.functions || 
        !window.financial.functions[funcName] || 
        typeof window.financial.functions[funcName].implementation !== "function"
      ) {
        console.warn(`No function implementation found for "${funcName}"`);
        return;
      }

      // gather the argument values from the row
      const args = argNames.map(arg => row[arg]);
      // call the function
      const result = window.financial.functions[funcName].implementation(...args);
      // store in the row by col.id
      row[col.id] = result || 0;
    });
  }

  function applyFormulaCols(row, formulaCols) {
    formulaCols.forEach(col => {
      const expr = col.formula || "";
      let result;
      try {
        // Bring row fields into scope
        with(row) {
          result = eval(expr);
        }
      } catch (err) {
        console.error(`Error evaluating formula "${expr}":`, err);
        result = null;
      }
      row[col.id] = result;
    });
  }

  // 11) Build the final table with aggregated totals + sub-rows
  function buildTable() {
    const tableContainer = document.createElement("div");
    const table = document.createElement("table");
    table.className = "table";

    // Table header
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");

    // Show columns for data, function, and formula
    const displayCols = appConfig.filter(c =>
      ["data", "function", "formula"].includes(c.column_type)
    );

    displayCols.forEach(col => {
      const th = document.createElement("th");
      th.innerText = col.heading;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body
    const tbody = document.createElement("tbody");
    const combinedKeys = Object.keys(window.combinedData);

    combinedKeys.forEach(uniqueVal => {
      const entry = window.combinedData[uniqueVal];
      if (!entry) return; // filtered out?

      const { subRows, totals } = entry;

      // Build "totals" row (the aggregated row for this uniqueVal)
      const totalsRow = document.createElement("tr");
      if (subRows.length > 1) {
        totalsRow.classList.add("groupHeadRow");
        totalsRow.style.cursor = "pointer";
        totalsRow.setAttribute("data-toggle", uniqueVal);
      }

      displayCols.forEach(col => {
        const td = document.createElement("td");
        const rawValue = totals[col.id];
        td.innerText = formatValue(rawValue, col.data_type);
        totalsRow.appendChild(td);
      });

      tbody.appendChild(totalsRow);

      // If multiple sub-rows, create hidden child rows
      if (subRows.length > 1) {
        subRows.forEach(sRow => {
          const subTr = document.createElement("tr");
          subTr.style.display = "none";
          subTr.classList.add(`subrow-${uniqueVal}`);
          subTr.classList.add("groupRow");
          displayCols.forEach(col => {
            const subTd = document.createElement("td");
            const rawValue = sRow[col.id];
            subTd.innerText = formatValue(rawValue, col.data_type);
            subTr.appendChild(subTd);
          });

          tbody.appendChild(subTr);
        });
      }
    });

    // **** NEW: Calculate "Total of Totals" ****
    const grandTotalsRow = document.createElement("tr");
    // gather the totals from each combinedData entry:
    const allTotals = combinedKeys
      .map(uniqueVal => window.combinedData[uniqueVal]?.totals)
      .filter(Boolean);
    // compute the grand totals (including function/formula columns!)
    const grandTotals = computeAggregates(allTotals);

    // We'll display "Grand Totals" in the cell for the unique column,
    // or in the first cell if you prefer
    displayCols.forEach(col => {
      const td = document.createElement("td");
      if (col.id === uniqueColumn) {
        td.innerText = "Grand Totals"; 
      } else {
        const rawValue = grandTotals[col.id];
        td.innerText = formatValue(rawValue, col.data_type);
      }
      grandTotalsRow.appendChild(td);
    });
    // append the grand totals row to the end:
    tbody.appendChild(grandTotalsRow);

    // Attach the table body
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    document.body.appendChild(tableContainer);

    // Toggle subrows on click
    table.addEventListener("click", e => {
      const tr = e.target.closest("tr[data-toggle]");
      if (!tr) return;
      const key = tr.getAttribute("data-toggle");
      const subs = table.querySelectorAll(`.subrow-${key}`);
      subs.forEach(subTr => {
        subTr.style.display = subTr.style.display === "none" ? "" : "none";
      });
    });
  }
})();

// -------------------- IndexedDB Helper Functions --------------------

// Open (or create) the database and object store.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('FinancialDB', 1);
    request.onerror = function() {
      reject('IndexedDB error');
    };
    request.onupgradeneeded = function(event) {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('apiCache')) {
        db.createObjectStore('apiCache', { keyPath: 'id' });
      }
    };
    request.onsuccess = function(event) {
      resolve(event.target.result);
    };
  });
}

// Retrieve a record from IndexedDB by key.
function getRecordFromIndexedDB(key) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['apiCache'], 'readonly');
      const store = transaction.objectStore('apiCache');
      const request = store.get(key);
      request.onsuccess = function(event) {
        resolve(event.target.result); // Expected format: { id, data, timestamp }
      };
      request.onerror = function() {
        reject('Error reading from IndexedDB');
      };
    });
  });
}

// Save a record into IndexedDB.
function saveRecordToIndexedDB(key, data) {
  return openDatabase().then(db => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['apiCache'], 'readwrite');
      const store = transaction.objectStore('apiCache');
      const record = {
        id: key,
        data: data,
        timestamp: Date.now()
      };
      const request = store.put(record);
      request.onsuccess = function() {
        resolve();
      };
      request.onerror = function() {
        reject('Error saving to IndexedDB');
      };
    });
  });
}

// -------------------- Statistics Helper Functions --------------------
function yearToDateFactor(fieldName) {
  let factor = 1; // default to 1
  const lowerStr = fieldName.toLowerCase();
  if (lowerStr.includes("mtd")) {
    factor = 12;
  } else if (lowerStr.includes("day") || lowerStr.includes("daily")) {
    factor = 365
  }
  return factor;
} 

function computeStatistics(data) { 
  const numericColumns = {};
  data.forEach(item => {
    Object.keys(item).forEach(key => {
      const v = parseFloat(item[key]);
      if (!isNaN(v)) {
        if (!numericColumns[key]) numericColumns[key] = [];
        numericColumns[key].push(v);
      }
    });
  });
  
  const results = {};
  Object.keys(numericColumns).forEach(col => {
    const vals = numericColumns[col];
    const count = vals.length;
    const mean = vals.reduce((a, b) => a + b, 0) / count;
    // Population variance: average of squared differences from the mean.
    const variance = vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / count;
    const stdDeviation = Math.sqrt(variance);
    
    results[col] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
      mean: mean,
      count: count,
      variance: variance,
      stdDeviation: stdDeviation,
      twoStdDeviations: [mean - 2 * stdDeviation, mean + 2 * stdDeviation],
      threeStdDeviations: [mean - 3 * stdDeviation, mean + 3 * stdDeviation]
    };
    results[col].YTDfactor = yearToDateFactor(col);
  });
  return results;
}

function renderFavicon() {
  const canvas = document.createElement('canvas'); 
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Define the SVG as a string
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 200 200">
    <!-- Bottom rotated square -->
    <g transform="rotate(45, 100, 100)">
      <rect x="35" y="35" width="130" height="130" fill="none" stroke="#007acc" stroke-width="4"/>
    </g>
    <!-- Top square -->
    <g>
      <rect x="35" y="35" width="130" height="130" fill="#4caf50" opacity="0.8" />
      <text x="100" y="130" font-family="Arial, sans-serif" font-size="100" fill="#ffffff" text-anchor="middle">
        FI
      </text>
    </g>
  </svg>`;

  // Create an image from the SVG
  const img = new Image();
  img.onload = function () {
    // Draw the SVG onto the canvas
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Generate the favicon
    const faviconUrl = canvas.toDataURL('image/png');
    let favicon = document.querySelector('link[rel="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = faviconUrl;
  };
  img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
}