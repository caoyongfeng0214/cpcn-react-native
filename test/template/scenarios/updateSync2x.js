var CodePushWrapper = require("../codePushWrapper.js");

module.exports = {
    startTest: function(testApp) {
        testApp.readyAfterUpdate();
        CodePushWrapper.sync(testApp);
        CodePushWrapper.sync(testApp);
    },
    
    getScenarioName: function() {
        return "Good Update (w/ Sync 2x)";
    }
};