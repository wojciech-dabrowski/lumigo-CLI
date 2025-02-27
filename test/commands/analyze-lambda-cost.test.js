const {expect, test} = require("@oclif/test");
const AWS = require("aws-sdk");

const mockGetMetricData = jest.fn();
AWS.CloudWatch.prototype.getMetricData = mockGetMetricData;
const mockListFunctions = jest.fn();
AWS.Lambda.prototype.listFunctions = mockListFunctions;

const consoleLog = jest.fn();
console.log = consoleLog;

const command = "analyze-lambda-cost";

afterEach(() => {
	mockGetMetricData.mockReset();
	mockListFunctions.mockReset();
	consoleLog.mockReset();
});

describe("analyze-lambda-cost", () => {
	describe("if a function has no metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"]);
			givenListFunctionsAlwaysReturns([]);
      
			givenGetMetricDataAlwaysReturns([
				{ functionName: "function-a", timestamps: [] }
			]);
		});
    
		test
			.stdout()
			.command([command])
			.it("deems the function as no cost", () => {
				const calls = consoleLog.mock.calls;
				const [table] = calls[0];
				expect(table).to.contain("function-a");
				expect(table).to.contain("128"); // memory
				expect(table).to.contain("-"); // cost
				expect(table).to.contain("0"); // invocation count
			});
    
		test
			.stdout()
			.command([command])
			.it("calls all regions", () => {
				expect(consoleLog.mock.calls).to.have.length.greaterThan(1);
				expect(mockListFunctions.mock.calls).to.have.length(16);
			});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("calls only one region", () => {
				expect(consoleLog.mock.calls).to.have.length.greaterThan(1);
				expect(mockListFunctions.mock.calls).to.have.length(1);
			});
	});
  
	describe("if a function has invocation metrics", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function"]);
			givenListFunctionsAlwaysReturns([]);
      
			givenGetMetricDataAlwaysReturns([
				{ label: "functionInvocationCount", values: [1000000] }, // 1M invocations
				{ label: "functionDuration", values: [100000000] } // 100M ms = 100ms/invocation
			]);
		});
    
		test
			.stdout()
			.command([command])
			.it("calculates the function's cost", () => {
				const [table] = consoleLog.mock.calls[0];
				expect(table).to.contain("function");
				expect(table).to.contain("128"); // memory
				expect(table).to.contain("1000000"); // invocation
				expect(table).to.contain("0.0000004080"); // cost per invocation
				expect(table).to.contain("0.4080000000"); // total cost
			});
	});
  
	describe("if there are more than one page of functions", () => {
		beforeEach(() => {
			givenListFunctionsReturns(["function-a"], true);
			givenListFunctionsReturns(["function-b"]);
      
			givenGetMetricDataAlwaysReturns([
				{ label: "functionInvocationCount", values: [1000000] }, // 1M invocations
				{ label: "functionDuration", values: [100000000] } // 100M ms = 100ms/invocation
			]);
		});
    
		test
			.stdout()
			.command([command, "-r", "us-east-1"])
			.it("recurses and fetches all functions", () => {
				expect(mockListFunctions.mock.calls).to.have.length(2);

				const [table] = consoleLog.mock.calls[0];
        
				expect(table).to.contain("function-a");
				expect(table).to.contain("function-b");
			});
	});
});

function givenGetMetricDataAlwaysReturns (metricData) {
	mockGetMetricData.mockReturnValue({
		promise: () => Promise.resolve({
			MetricDataResults: metricData.map(({ label, values }) => ({
				Label: label,
				Values: values
			}))
		})
	});
};

function givenListFunctionsReturns (functionNames, hasMore = false) {
	mockListFunctions.mockReturnValueOnce({
		promise: () => Promise.resolve({
			Functions: functionNames.map(name => ({
				FunctionName: name,
				Runtime: "nodejs10.x",
				MemorySize: 128,
				CodeSize: 1024,
				LastModified: new Date().toJSON()        
			})),
			NextMarker: hasMore ? "more" : undefined
		})
	});
};

function givenListFunctionsAlwaysReturns (functionNames) {
	mockListFunctions.mockReturnValue({
		promise: () => Promise.resolve({
			Functions: functionNames.map(name => ({
				FunctionName: name,
				Runtime: "nodejs10.x",
				MemorySize: 128,
				CodeSize: 1024,
				LastModified: new Date().toJSON()        
			}))
		})
	});
}
