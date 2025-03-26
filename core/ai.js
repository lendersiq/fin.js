// core/ai.js
window.synonyms = [
  ["amount", "principal"],
  ["withdrawal", "check", "debit"],
  ["deposit", "credit"]
];

function aiIsBusiness(...args) {  
  // Extract the params object from args
  const params = args[0][0];

  // Initialize isBusiness to false
  let isBusiness = false;

  // Validation: Check if relevant parameters exist and have valid values
  if (typeof params.balance !== 'number' || typeof params.consumerMaximum !== 'number' || typeof params.annualDeposits !== 'number') {
    throw new Error("Invalid or missing parameters. Ensure 'balance', 'consumerMaximum', and 'deposits' are provided as numbers.");
  }
  const threeStandardDeviations = getStatistic(params.sourceIndex, 'balance', 'threeStdDeviations')[1];
  const twoStandardDeviations = getStatistic(params.sourceIndex, 'balance', 'twoStdDeviations')[1];

  const highThreshold = threeStandardDeviations > params.consumerMaximum * 1.2  ?  threeStandardDeviations : params.consumerMaximum * 1.2; // 20% over the consumer threshold
  const lowThreshold = twoStandardDeviations > params.consumerMaximum * .8  ?  twoStandardDeviations : params.consumerMaximum * .8; // 20% under the consumer threshold
  // Proceed with the logic if parameters are valid
  if (params.balance > highThreshold) {  
    isBusiness = true;
  } else if (params.annualDeposits > 72 && params.balance > lowThreshold) {  
    isBusiness = true;
  }

  return isBusiness;
  //ai  -- can consider standard deviation or median of all balances by source
}

/**********************************************************
 * 2) A minimal "naive" stemmer:
 *    - Lowercase
 *    - Trim
 *    - Remove trailing "s", "ed", "ing"
 **********************************************************/
function naiveStem(str) {
  let s = str.toLowerCase().trim();
  s = s.replace(/s$/, '');
  s = s.replace(/ed$/, '');
  s = s.replace(/ing$/, '');
  return s;
}

/**********************************************************
 * 3) findSynonymGroup(paramName):
 *    - Stem the paramName
 *    - Return the sub-array in window.synonyms if found
 **********************************************************/
function findSynonymGroup(paramName) {
  const stemmedParam = naiveStem(paramName);
  // Loop through each group in window.synonyms
  for (const group of window.synonyms) {
    // If ANY word in the group stems to the same as paramName, 
    // return that group
    for (const word of group) {
      if (naiveStem(word) === stemmedParam) {
        return group;
      }
    }
  }
  // If none match
  return null;
}

/**********************************************************
 * 4) isSubstringMatch(stemA, stemB):
 *    - Return true if stemA is in stemB OR stemB is in stemA
 **********************************************************/
function isSubstringMatch(stemA, stemB) {
  return stemA.includes(stemB) || stemB.includes(stemA);
}

/**********************************************************
 * 5) findMatchInKeys(word, keys):
 *    - Stem the 'word'
 *    - Loop over row keys, stem them
 *    - If substring matches, return that key
 **********************************************************/
function findMatchInKeys(word, keys) {
  const wordStem = naiveStem(word);

  for (const key of keys) {
    const keyStem = naiveStem(key);
    if (isSubstringMatch(wordStem, keyStem)) {
      return key; // Return the first match found
    }
  }

  return null;
}

/**********************************************************
 * 6) findBestKey(paramName, keys):
 *    - 1) Try a direct substring match on the paramName
 *    - 2) If not found, see if paramName belongs to any
 *         synonym group. If so, try each synonym in that group.
 *    - Return the first match or null if none is found.
 **********************************************************/
function findBestKey(paramName, keys) {
  // 1) Attempt direct match
  let match = findMatchInKeys(paramName, keys);
  if (match) {
    //console.log(`[findBestKey] Direct match for "${paramName}" =>`, match);
    return match;
  }
  
  // 2) Check if paramName belongs to any synonym group
  const group = findSynonymGroup(paramName);
  if (group) {
    const paramStem = naiveStem(paramName);
    for (const synonym of group) {
      // Skip if it's literally the same word we already tried
      if (naiveStem(synonym) === paramStem) {
        continue;
      }
      match = findMatchInKeys(synonym, keys);
      if (match) {
        //console.log(`[findBestKey] Synonym "${synonym}" for "${paramName}" =>`, match);
        return match;
      }
    }
  }

  // 3) No match found
  //console.log(`[findBestKey] No match for "${paramName}" => null`);
  return null;
}

/**********************************************************
 * Testing
 **********************************************************/
// Suppose these are the row keys we have
const rowKeys = [
  "Portfolio",
  "Open_Date",
  "Branch_Number",
  "Class_Code",
  "Owner_Code",
  "Statement_Rate",
  "Average_Balance",
  "PMTD_Interest_Earned",
  "PMTD_Checks",
  "PMTD_Service_Charge",
  "PMTD_Service_Charge_Waived",
  "PMTD_Other_Charges",
  "PMTD_Other_Charges_Waived",
  "PMTD_Number_of_Deposits",
  "PMTD_Number_of_Items_NSF",
  "Risk_Rating",
  "Maturity_Date"
];

console.log('AI Tests')
// 7A) "withdrawals" => stems to "withdrawal"
//     direct match fails
//     findSynonymGroup => ["withdrawal", "check", "debit"]
//     tries "withdrawal", then "check", then "debit"
//     "check" => match "PMTD_Checks" 
console.log(`'withdrawals' match test "check" => match "PMTD_Checks": `, findBestKey("withdrawals", rowKeys));

// 7B) "sourceIndex" => 
//     no direct match, not in any synonym group => null
console.log(`'sourceIndex' match test (null): `, findBestKey("sourceIndex", rowKeys));

// 7C) "checks" => 
//     direct match fails
//     findSynonymGroup => ["withdrawal", "check", "debit"] 
//         because "checks" => "check"
//     tries synonyms => "withdrawal", "check", "debit"
//     "check" => match "PMTD_Checks"
console.log(`'checks' match test "check" => match "PMTD_Checks": `, findBestKey("checks", rowKeys));

// 7D) "amount" => 
//     direct match fails
//     synonym group => ["amount", "principal"]
//     tries "principal", might or might not match something 
//     in rowKeys. If there's no overlap, returns null
console.log(`'amount' match test (null): `, findBestKey("amount", rowKeys));
console.log(`'risk' match test "risk" => match "Risk_Rating": `, findBestKey("risk", rowKeys));
console.log(`'maturity' match test "maturity" => match "Maturity_Date": `, findBestKey("maturity", rowKeys));

function getStatistic(sourceIndex, paramName, statistic) {
  const statistics = window.statistics[sourceIndex];
  const keys = Object.keys(statistics)
  const statIndex =  findBestKey(paramName, keys); 
  const designatedStat = statistics[statIndex];  
  if (designatedStat && Object.hasOwn(designatedStat, statistic)) {
    return designatedStat[statistic];
  } else {
    if (window.logger) { console.warn (`${statistic} statistic not found`) } 
  }
}
