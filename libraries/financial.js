// libraries/financial.js

window.financial = {
  functions: {
    interestIncome: {
      description: "Calculates the interest income based on principal and annual rate",
      implementation: function(principal, rate) {
        //console.log('interestIncome', principal, rate);
        const treasuryCurve = financial.api.treasuryCurve();
        return principal * rate;
      }
    },
    costofFunds: {
      description: "Calculates the cost of funds",
      implementation: function(principal, rate) {
        // Access the cached treasury curve data.
        if (!window.financial.api._cache) {
          console.warn('Treasury data not yet loaded. Returning default value.');
          return 0;
        }
        // Example: multiply principal with the second value from the treasury curve.
        return principal * window.financial.api._cache.treasuryCurve.values[1];
      }
    },
    averageBalance: {
      description: "Calculates the average balance of a loan over its term",
      implementation: function(principal, payment, rate, maturity) {
          //console.log('principal, payment, rate, maturity', principal, payment, rate, maturity)
          // Determine months until maturity using either maturity date or term
          const {monthsUntilMaturity, yearsUntilMaturity} = functions.untilMaturity.implementation(maturity);
          const monthlyRate = rate < 1 ? parseFloat(rate) / 12 : parseFloat(rate / 100) / 12;
          //console.log('payment, monthly rate, monthsUntilMaturity', payment, monthlyRate, monthsUntilMaturity)
          // Calculate the total principal over the loan period
          let cummulativePrincipal = 0;
          let tempPrincipal = principal;
          var month = 0;
          while (month < monthsUntilMaturity && tempPrincipal > 0) {
              cummulativePrincipal += tempPrincipal;
              tempPrincipal -= payment - tempPrincipal * monthlyRate;
              month++;
          }
          // Calculate average balance
          const averageBalance = cummulativePrincipal / monthsUntilMaturity;
          //console.log('principal, payment, rate, maturity, average', principal, payment, rate, maturity, averageBalance)
          return averageBalance.toFixed(2);
      }
    },
    untilMaturity: {
      description: "Calculates the number of months and years to maturity of a financial instrument",
      implementation: function(maturity = null) {
        let monthsUntilMaturity, yearsUntilMaturity;

        if (maturity) {
            const maturityDate = new Date(maturity);
            const currentDate = new Date();

            // Calculate the number of months from currentDate to maturityDate
            const yearsDifference = maturityDate.getFullYear() - currentDate.getFullYear();
            const monthsDifference = maturityDate.getMonth() - currentDate.getMonth();

            // Total months until maturity
            monthsUntilMaturity = yearsDifference * 12 + monthsDifference;

            // Adjust if days in the current month are fewer than the day of the maturity date
            if (currentDate.getDate() > maturityDate.getDate()) {
                monthsUntilMaturity -= 1;
            }

            // Ensure monthsUntilMaturity is at least 1
            monthsUntilMaturity = Math.max(1, monthsUntilMaturity);

            // Calculate yearsUntilMaturity as the integer part of monthsUntilMaturity divided by 12
            yearsUntilMaturity = monthsUntilMaturity / 12;

            // Ensure yearsUntilMaturity is at least 1
            yearsUntilMaturity = Math.max(1, yearsUntilMaturity);

        } else {
            console.warn('Maturity date not provided, defaulting to 12 months and 1 year');
            monthsUntilMaturity = 12; // Default to 12 months if no maturity date is provided
            yearsUntilMaturity = 1;    // Default to 1 year
        }

        return { monthsUntilMaturity, yearsUntilMaturity };
      }
    },
    sinceOpen: {
      description: "Calculates the number of months and years from the open date of a financial instrument",
      implementation: function(open = null) {
          let monthsSinceOpen, yearsSinceOpen;
          if (open) {
              const openDate = new Date(open);
              const currentDate = new Date();
  
              // Calculate the number of months from openDate to currentDate
              const yearsDifference = currentDate.getFullYear() - openDate.getFullYear();
              const monthsDifference = currentDate.getMonth() - openDate.getMonth();
  
              // Total months since openDate
              monthsSinceOpen = yearsDifference * 12 + monthsDifference;
  
              // Adjust if days in the current month are fewer than the day of the open date
              if (currentDate.getDate() < openDate.getDate()) {
                  monthsSinceOpen -= 1;
              }
  
              // Ensure monthsSinceOpen is at least 1
              monthsSinceOpen = Math.max(1, monthsSinceOpen);
  
              // Calculate yearsSinceOpen as the integer part of monthsSinceOpen divided by 12
              yearsSinceOpen = monthsSinceOpen / 12;
  
              // Ensure yearsSinceOpen is at least 1
              yearsSinceOpen = Math.max(1, yearsSinceOpen);
  
          } else {
              console.warn('Open date not provided, defaulting to 12 months and 1 year');
              monthsSinceOpen = 12; // Default to 12 months if no open date is provided
              yearsSinceOpen = 1;    // Default to 1 year
          }
  
          return { monthsSinceOpen, yearsSinceOpen };
      }
    },
    risk: {
      description: "Scores the risk of a checking account",
      implementation: function(balance, checks, deposits, nsf, source = null) {
        if (balance === 0 || source === null) return 0
        window.risk = window.risk || {};
        window.risk.balanceObject = window.risk.balanceObject || {};
        if (!window.risk.balanceObject[source]) {
          window.risk.balanceObject[source] = window.statistics[source][
            aiTranslator(Object.keys(window.statistics[source]), 'balance')
          ];
        }
        
        const balanceObject = window.risk.balanceObject[source];
        console.log('balanceObject', balanceObject)
        let balanceRisk = 1;
        if (balance > balanceObject.threeStdDeviations[1]) {
            balanceRisk = 5;
        } else if (balance > balanceObject.mean) {
            balanceRisk = 3;
        }

        // issuing checks for payroll, vendor payments, or refunds during specific times of the year may have a greater risk.
        window.risk.checksObject = window.risk.checksObject || {};
        if (!window.risk.checksObject[source]) {
          window.risk.checksObject[source] = window.statistics[source][
            aiTranslator(Object.keys(window.statistics[source]), 'checks')
          ];
        }
        const checksObject = window.risk.checksObject[source];
        let checksRisk = 1;
        if (checks > checksObject.threeStdDeviations[1]) {
            checksRisk = 5;
        } else if (checks > checksObject.twoStdDeviations[1]) {
            checksRisk = 4;
        } else if (checks > checksObject.mean) {
            checksRisk = 2;
        }

        // Regular deposits (e.g., payroll or vendor payments) indicate frequency of activity--higher active accounts may indicate risk.
        window.risk.depositsObject = window.risk.depositsObject || {};
        if (!window.risk.depositsObject[source]) {
          window.risk.depositsObject[source] = window.statistics[source][
            aiTranslator(Object.keys(window.statistics[source]), 'deposits')
          ];
        }
        const depositsObject = window.risk.depositsObject[source];
        let depositsRisk = 1;
        if (deposits > depositsObject.threeStdDeviations[1]) {
            depositsRisk = 5;
        } else if (deposits > depositsObject.twoStdDeviations[1]) {
            depositsRisk = 2;
        }

        // High overdraft activity could signal poor account management.
        window.risk.NSFsObject = window.risk.NSFsObject || {};
        if (!window.risk.NSFsObject[source]) {
          window.risk.NSFsObject[source] = window.statistics[source][
            aiTranslator(Object.keys(window.statistics[source]), 'nsf')
          ];
        }
        const NSFsObject = window.risk.NSFsObject[source];
        let NSFsRisk = 1;
        if (nsf > NSFsObject.threeStdDeviations[1]) {
            NSFsRisk = 5;
        }    

        return balanceRisk * dictionaries.depositRiskWeights["balance"] +
            checksRisk * dictionaries.depositRiskWeights["checks"] +
            depositsRisk * dictionaries.depositRiskWeights["deposits"] +
            NSFsRisk * dictionaries.depositRiskWeights["nsf"];
      }
    },
    /*
    * @param {number} expectedLifeMonths - Expected life of the deposit in months.
    * @param {string} depositType - Type of deposit ('checking', 'savings', 'certificates').
    * @returns {number} FTP rate as a decimal.
    */
    calculateFtpRate: {
      description: "Calculates the funds transfer pricing credit using the discountFTP dictionary and Treasury rates from an external API.",
      implementation: function(expectedLifeMonths, depositType) {
        // Step 1: Retrieve the Treasury rate from the external API
        //console.log('financial.api', financial.api._cache)
        const treasuryRate = financial.api._cache.treasuryCurve.values[expectedLifeMonths];
        
        if (treasuryRate === undefined) {
            throw new Error(`Treasury rate not found for ${expectedLifeMonths} months.`);
        }      
        // Initialize total adjustments
        let totalAdjustments = 0;
        // Helper function to get adjustment value
        function getAdjustmentFactor(adjustmentType) {
          const adjustment = financial.dictionaries.discountFTP[adjustmentType];
          if (!adjustment) return 0;
      
          if (depositType === 'certificate') {
              // Determine term based on expectedLifeMonths
              const term = expectedLifeMonths <= 12 ? 'shortTerm' : 'longTerm';
              return adjustment.certificates.values[term] || 0;
          } else {
              return adjustment[depositType]?.value || 0;
          }
        }

        // Step 2: Calculate Adjustments using the dictionary
        const interestRateRiskAdjustment = parseFloat(getAdjustmentFactor('interestRateRisk') * treasuryRate);
        const liquidityAdjustment = parseFloat(getAdjustmentFactor('liquidity') * treasuryRate); 
        const operationalRiskAdjustment = parseFloat(getAdjustmentFactor('operationalRisk') * treasuryRate);
        const depositAcquisitionCost = parseFloat(getAdjustmentFactor('depositAcquisitionCost') * treasuryRate);
        const regulatoryRiskAdjustment = financial.dictionaries.discountFTP.regulatoryRisk.value * treasuryRate || 0; // Same for all
        
        // Step 3: Sum all adjustments
        totalAdjustments = interestRateRiskAdjustment
          - liquidityAdjustment
          + operationalRiskAdjustment
          + regulatoryRiskAdjustment
          + depositAcquisitionCost;

        // Step 4: Calculate FTP Rate
        const ftpRate = treasuryRate - totalAdjustments;
        //console.log('FTP log', treasuryRate, interestRateRiskAdjustment.toFixed(4), liquidityAdjustment, operationalRiskAdjustment, depositAcquisitionCost, regulatoryRiskAdjustment, ftpRate);
        return ftpRate;
      }
    },

    checkingProfit: {
      description: "Calculates the profit of checking accounts",
      implementation: function(balance, open, interest=null, rate=null, charges=null, waived=null, deposits=null, withdrawals=null) {
        const sourceIndex = 'checking';
        const creditRate = financial.functions.calculateFtpRate.implementation(12, sourceIndex);
        const creditForFunding = creditRate * balance * (1 - financial.attributes.ddaReserveRequired.value);
        const { monthsSinceOpen, yearsSinceOpen } = financial.functions.sinceOpen.implementation(open);

        return creditRate;
        var operatingExpense = 100;  //default
        var fraudLoss = 0;
        var interestExpense = 0;
    
        const annualDeposits = deposits / yearsSinceOpen;
        const annualWithdrawals = withdrawals / yearsSinceOpen;
          
        //aiIdConsumerSmallBiz  
        //const consumerMaximum = financial.dictionaries.consumerMaximum.values[sourceIndex];
        //const params = {balance, interest, sourceIndex, annualDeposits, annualWithdrawals, consumerMaximum};
        //const isBusiness = aiIsBusiness([params]);  // @ai.js
        isBusiness = false;
        let accountType = "Consumer";
        if (isBusiness) {
          accountType = "Business";
        }
        interestExpense = interest * window.statistics[sourceIndex][aiTranslator(Object.keys(window.statistics[sourceIndex]), 'interest')].YTDfactor;
        if (financial.dictionaries.annualOperatingExpense[sourceIndex].values[accountType]) {
          operatingExpense = financial.dictionaries.annualOperatingExpense[sourceIndex].values[accountType];
        }
        fraudLoss = organization.attributes.capitalTarget.value * financial.attributes.fraudLossFactor.value * balance;
          
        let feeIncome = 0;
        if (charges) {
            const netCharges = waived ? (charges - waived) : charges;
            feeIncome = netCharges * window.statistics[sourceIndex][aiTranslator(Object.keys(window.statistics[sourceIndex]), 'charges')].YTDfactor;
        }

        const depositsExpense = deposits * financial.attributes.depositUnitExpense.value;            
        const withdrawalsExpense =  withdrawals * financial.attributes.withdrawalUnitExpense.value;
        const pretaxIncome = creditForFunding + feeIncome;
        const pretaxExpense = interestExpense + depositsExpense + withdrawalsExpense + operatingExpense + fraudLoss; 
        const pretaxProfit = pretaxIncome - pretaxExpense;
        const profit = pretaxProfit * (1 - window.libraries.organization.attributes.taxRate.value);
        //console.log(`portfolio: ${portfolio}, balance: ${balance}, creditRate: ${creditRate}, creditForFunding: ${creditForFunding}, rate: ${rate} interestExpense: ${interestExpense}, charges: ${charges}, waived: ${waived}, deposits: ${deposits}, deposits expense: ${depositsExpense}, withdrawals expense: ${withdrawalsExpense}, operatingExpense: ${operatingExpense}, fraudLoss: ${fraudLoss}, pretax: ${pretaxProfit}, taxAdj: ${1 - window.libraries.organization.attributes.taxRate.value}, depositProfit: ${profit}`);
        return profit;
      }
    },
  },

  api: {
    // In-memory cache for each API endpoint.
    _cache: {},
    // Cache promises to avoid duplicate concurrent calls.
    _cachePromises: {},
    // Define maximum age for cached data (1 week).
    oneWeek: 7 * 24 * 60 * 60 * 1000,

    /**
     * Generic function that retrieves API data using a local-first strategy.
     * @param {string} key - Unique key for the API endpoint.
     * @param {string} url - URL to fetch the API data.
     * @returns {Promise<any>} - Resolves with the API data.
     */
    localFirstApiCall: async function(key, url) {
      // Return in-memory cache if available.
      if (this._cache[key]) {
        return this._cache[key];
      }
      // Return a pending promise if already in progress.
      if (this._cachePromises[key]) {
        return this._cachePromises[key];
      }
      
      this._cachePromises[key] = (async () => {
        try {
          // Check for a stored record in IndexedDB.
          const dbRecord = await getRecordFromIndexedDB(key);
          const now = Date.now();
          if (dbRecord && (now - dbRecord.timestamp) < this.oneWeek) {
            // Use the locally stored data if it’s fresh.
            this._cache[key] = dbRecord.data;
            console.log(`Using cached data for ${key} from IndexedDB:`, this._cache[key]);
            return this._cache[key];
          }
          
          // Otherwise, fetch fresh data from the API.
          const response = await fetch(url);
          const data = await response.json();
          if (data.error) {
            console.error(`API error for ${key}:`, data.error);
            throw new Error(data.error);
          }
          
          // Cache the data in memory.
          this._cache[key] = data;
          console.log(`Fetched fresh data for ${key} from API:`, data);
          // Save the data to IndexedDB.
          await saveRecordToIndexedDB(key, data);
          return data;
        } catch (error) {
          console.error(`Error in localFirstApiCall for ${key}:`, error);
          // Reset the promise on error so future calls can retry.
          this._cachePromises[key] = null;
          throw error;
        }
      })();
      
      return this._cachePromises[key];
    },

    // Treasury curve API call uses the generic local-first function.
    treasuryCurve: async function() {
      return await this.localFirstApiCall('treasuryCurve', 'https://bankersiq.com/api/trates/');
    }

    // Additional API calls can use localFirstApiCall with their own key and URL.
  },

  attributes: {
    ddaReserveRequired: {
      description: "The required fed reserve for checking accounts / demand deposit accounts(DDA)",
      value: 0.10
    }
  },

  // supporting dictionaries
  dictionaries: {
    depositRiskWeights: {
      description: "The weights for each deposit account risk criteria",
      "checks": 5,
      "balance": 5,
      "deposits": 3,
      "nsf": 1
    },
    discountFTP: {
      interestRateRisk: {
          description: "Adjustments reflecting the interest rate risk of deposits compared to market instruments.",
          checking: {
              value: 0 // 0%
          },
          savings: {
              value: 0.05 // 5%
          },
          certificates: {
              values: {
                  shortTerm: 0.10, // 10%
                  longTerm: 0.25   // 25%
              }
          }
      },
      liquidity: {
          description: "Adjustments reflecting the liquidity benefits of deposits to the bank.",
          checking: {
              value: 0.1 // 10%
          },
          savings: {
              value: 0.05 // 5%
          },
          certificates: {
              values: {
                  shortTerm: 0.025, // 2.5%
                  longTerm: 0.015   // 1.5%
              }
          }
      },
      operationalRisk: {
          description: "Adjustments for operational risks and costs associated with different deposit types.",
          checking: {
              value: 0.15 // 15%
          },
          savings: {
              value: 0.075 // 7.5%
          },
          certificates: {
              values: {
                  shortTerm: 0.02, // 2%
                  longTerm: 0.01   // 1%
              }
          }
      },
      regulatoryRisk: {
          description: "Adjustments for regulatory costs such as deposit insurance premiums",
          value: 0.1 // 10% (same for all deposit types)
      },
      depositAcquisitionCost: {
          description: "Adjustments for costs related to acquiring deposits.",
          checking: {
              value: 0.25 // 25%
          },
          savings: {
              value: 0.1 // 10%
          },
          certificates: {
              values: {
                  shortTerm: 0.05, // 5%
                  longTerm: 0.05   // 5%
              }
          }
      }
    }
  }
};

window.financial.api.treasuryCurve()
  .then(treasuryData => {
    console.log('Treasury data:', treasuryData);
  })
  .catch(error => {
    console.error('Preloading treasury curve data failed:', error);
  });