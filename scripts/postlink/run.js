var inquirer = require('inquirer');

var postlinks = [
    require("./android/postlink"),
    require("./ios/postlink")
];

inquirer.prompt([{
    "type": "input",
    "name": "androidDeploymentKey",
    "message": "What is your CodePush deployment key for Android (hit <ENTER> to ignore)"
},{
    "type": "input",
    "name": "iosDeploymentKey",
    "message": "What is your CodePush deployment key for iOS (hit <ENTER> to ignore)"
}]).then(function(answer){
    postlinks[0].KEY = answer;
    postlinks[1].KEY = answer;
    postlinks
        .reduce((p, fn) => p.then(fn), Promise.resolve())
        .catch((err) => {
            console.error(err.message);
        });
    return Promise.resolve();
});