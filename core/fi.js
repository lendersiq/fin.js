(() => {
  // 1) Validate appConfig
  if (!appConfig || !Array.isArray(appConfig)) {
    console.error("appConfig is not defined or is not an array.");
    return;
  }

  // 2) Identify the unique column config (exactly one assumed)
  const uniqueConfig = appConfig.find(cfg => cfg.column_type === 'data' && cfg.data_type === 'unique');
  if (!uniqueConfig) {
    console.error("No unique column configuration found (data_type = 'unique').");
    return;
  }
  const uniqueColumn = uniqueConfig.id;

  // 3) Prepare global data structures
  window.rawData = {};       // rawData[sourceName] => array of filtered rows
  window.combinedData = {};  // combined object keyed by unique column

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
  const modalBackdrop = document.createElement('div');
  Object.assign(modalBackdrop.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.4)',
    zIndex: '9999',
  });

  const modal = document.createElement('div');
  Object.assign(modal.style, {
    background: '#fff',
    padding: '1rem',
    borderRadius: '5px',
    width: '300px',
    maxHeight: '80vh',
    overflowY: 'auto',
  });

  const title = document.createElement('h2');
  title.textContent = 'Upload CSV Files';
  modal.appendChild(title);

  // 6) For each source, create a file input
  uniqueSources.forEach(sourceName => {
    const label = document.createElement('label');
    label.textContent = `Select CSV for: ${sourceName}`;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';

    fileInput.addEventListener('change', evt => {
      const file = evt.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = e => {
        const csvContent = e.target.result;

        // 6.1) Identify relevant config columns for this source
        const relevantConfigItems = appConfig.filter(
          c => c.source_name === sourceName && c.column_type === 'data'
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
    label.appendChild(document.createElement('br'));
    label.appendChild(fileInput);
    modal.appendChild(label);
    modal.appendChild(document.createElement('hr'));
  });

  // "Done" button to close the modal
  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Done';
  closeBtn.addEventListener('click', () => {
    document.body.removeChild(modalBackdrop);
  });
  modal.appendChild(closeBtn);

  modalBackdrop.appendChild(modal);
  document.body.appendChild(modalBackdrop);

  // 7) CSV parser
  function parseCSV(csvString) {
    const lines = csvString
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const dataRows = lines.slice(1);

    return dataRows.map(row => {
      const values = row.split(',');
      const obj = {};
      headers.forEach((header, idx) => {
        obj[header] = values[idx] ? values[idx].trim() : '';
      });
      return obj;
    });
  }

  // Example formatValue function
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  });
  const integerFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  });
  const floatFormatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3
  });

  function formatValue(value, dataType) {
    if (value == null || value === '') {
      return ''; 
    }

    switch (dataType) {
      case 'currency':
        const parsedCurrency = parseFloat(value);
        return isNaN(parsedCurrency) ? value : currencyFormatter.format(parsedCurrency);

      case 'integer':
        const parsedInt = parseInt(value, 10);
        return isNaN(parsedInt) ? value : integerFormatter.format(parsedInt);

      case 'float':
        const parsedFloat = parseFloat(value);
        return isNaN(parsedFloat) ? value : floatFormatter.format(parsedFloat);

      default:
        // 'unique', other data types, or fallback
        return value;
    }
  }

  // 8) Combine data across sources into window.combinedData
  //    keyed by the uniqueColumn. Then apply filter logic.
  function combineData() {
    // Start fresh
    window.combinedData = {};

    // Merge
    Object.keys(window.rawData).forEach(sourceName => {
      const rows = window.rawData[sourceName];
      rows.forEach(row => {
        const uniqueValue = row[uniqueColumn];
        if (!uniqueValue) return; // skip if missing the unique ID

        if (!window.combinedData[uniqueValue]) {
          // Create a new object with the unique column
          window.combinedData[uniqueValue] = { [uniqueColumn]: uniqueValue };
        }
        // Merge each column from this row
        Object.keys(row).forEach(col => {
          if (col !== uniqueColumn) {
            window.combinedData[uniqueValue][col] = row[col];
          }
        });
      });
    });

    // 8.1) Apply filters if needed
    applyFilters();

    console.log('Combined and filtered data:', window.combinedData);

    // Create container, table
    const tableContainer = document.createElement('div');
    const intersectTable = document.createElement('table');
    intersectTable.className = 'table';

    // Create header row
    const headerRow = document.createElement('tr');
    appConfig.forEach(col => {
      const th = document.createElement('th');
      th.innerText = col.heading;
      headerRow.appendChild(th);
    });
    intersectTable.appendChild(headerRow);

    // Build data rows
    Object.keys(window.combinedData).forEach(uniqueVal => {
      const rowObj = window.combinedData[uniqueVal];

      // Optional check: only show rows that have all columns
      if (Object.values(rowObj).length === appConfig.length) {
        const tr = document.createElement('tr');
        appConfig.forEach(col => {
          const td = document.createElement('td');
          const rawValue = rowObj[col.id];
          const formattedValue = formatValue(rawValue, col.data_type);
          td.innerText = formattedValue;
          tr.appendChild(td);
        });
        intersectTable.appendChild(tr);
      }
    });

    tableContainer.appendChild(intersectTable);
    document.body.appendChild(tableContainer);

  }

  // 9) Apply filters from appConfig to combinedData
  function applyFilters() {
    // 9.1) Collect all configs with a filter
    const filterConfigs = appConfig.filter(c => c.filter && c.column_type === 'data');
    if (filterConfigs.length === 0) return; // No filters, do nothing

    // 9.2) Build an array of { column, fn } so we can quickly evaluate each row
    const parsedFilters = filterConfigs.map(cfg => {
      return {
        column: cfg.id,
        apply: createFilterFn(cfg.filter, cfg.data_type)
      };
    });

    // 9.3) For each uniqueValue in combinedData, check if it passes all filters
    Object.keys(window.combinedData).forEach(uniqueVal => {
      const row = window.combinedData[uniqueVal];
      let keep = true;

      for (const filterObj of parsedFilters) {
        const col = filterObj.column;
        const val = row[col];
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
    // Trim whitespace
    filter = filter.trim();

    // This helper will convert string values to appropriate types
    function convert(val) {
      if (dataType === 'integer' && val !== undefined && val !== null) {
        const parsed = parseInt(val, 10);
        return isNaN(parsed) ? val : parsed;
      }
      // You might add a "currency" check here, removing "$" or ",".
      // For now, just return the raw string if not integer.
      return val;
    }

    // 10.1) If filter is an array syntax like "[10,20]"
    //       we parse that as a list of acceptable values
    if (/^\[.*\]$/.test(filter)) {
      let arr;
      try {
        arr = JSON.parse(filter); // e.g. "[10,20]" => [10, 20]
      } catch (e) {
        console.error("Failed to parse array filter:", filter, e);
        // Default to allowing everything if parse fails
        return () => true;
      }

      // Return a function that checks membership
      return (rawValue) => {
        const actualValue = convert(rawValue);
        return arr.includes(actualValue);
      };
    }

    // 10.2) If filter is a comparison like "==20", ">=100", "<10", etc.
    const comparisonPattern = /^(==|!=|>=|<=|>|<)\s*(.*)$/;
    const match = filter.match(comparisonPattern);
    if (match) {
      const operator = match[1];
      const operandStr = match[2].trim();

      return (rawValue) => {
        const leftVal = convert(rawValue);
        const rightVal = convert(operandStr);

        switch (operator) {
          case '==': return leftVal == rightVal;
          case '!=': return leftVal != rightVal;
          case '>':  return leftVal > rightVal;
          case '<':  return leftVal < rightVal;
          case '>=': return leftVal >= rightVal;
          case '<=': return leftVal <= rightVal;
          default:
            // Unrecognized operator
            return true;
        }
      };
    }

    // 10.3) Otherwise, unrecognized filter pattern
    console.warn("Unrecognized filter pattern:", filter);
    // Default to allow all
    return () => true;
  }
})();
