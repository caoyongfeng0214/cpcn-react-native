
var linkTools = require('../../tools/linkToolsIos');
var fs = require("fs");
var inquirer = require('inquirer');
var plist = require("plist");
var semver = require('semver');

var package = require('../../../../../package.json');

module.exports = () => {

    console.log("Running ios postlink script");

    var appDelegatePath = linkTools.getAppDeletePath();

    if (!appDelegatePath) {
        return Promise.reject(`Couldn't find AppDelegate. You might need to update it manually \
    Please refer to plugin configuration section for iOS at \
    http://code-push.cn`);
    }

    var reactNativeVersion = package && package.dependencies && package.dependencies["react-native"];

    var appDelegateContents = fs.readFileSync(appDelegatePath, "utf8");

    // 1. Add the header import statement
    if (~appDelegateContents.indexOf(linkTools.codePushHeaderImportStatement)) {
        console.log(`"CodePush.h" header already imported.`);
    } else {
        var appDelegateHeaderImportStatement = `#import "AppDelegate.h"`;
        appDelegateContents = appDelegateContents.replace(appDelegateHeaderImportStatement,
            `${appDelegateHeaderImportStatement}${linkTools.codePushHeaderImportStatementFormatted}`);
    }

    // 2. Modify jsCodeLocation value assignment

    if (!reactNativeVersion) {
        console.log(`Can't take react-native version from package.json`);
    } else if (semver.gte(semver.coerce(reactNativeVersion), "0.59.0")) {
        var oldBundleUrl = linkTools.oldBundleUrl;
        var codePushBundleUrl = linkTools.codePushBundleUrl;

        if (~appDelegateContents.indexOf(codePushBundleUrl)) {
            console.log(`"BundleUrl" already pointing to "[CodePush bundleURL]".`);
        } else {
            if (~appDelegateContents.indexOf(oldBundleUrl)) {
                appDelegateContents = appDelegateContents.replace(oldBundleUrl, codePushBundleUrl);
            } else {
                console.log(`AppDelegate isn't compatible for linking`);
            }
        }
    } else {
        var jsCodeLocations = appDelegateContents.match(/(jsCodeLocation = .*)/g);

        if (!jsCodeLocations) {
            console.log('Couldn\'t find jsCodeLocation setting in AppDelegate.');
        }

        var newJsCodeLocationAssignmentStatement = linkTools.codePushGradleLink;
        if (~appDelegateContents.indexOf(newJsCodeLocationAssignmentStatement)) {
            console.log(`"jsCodeLocation" already pointing to "[CodePush bundleURL]".`);
        } else {
            if (jsCodeLocations.length === 1) {
                // If there is one `jsCodeLocation` it means that react-native app version is not the 0.57.8 or 0.57.0 and lower than 0.59 
                // and we should replace this line with DEBUG ifdef statement and add CodePush call for Release case

                var oldJsCodeLocationAssignmentStatement = jsCodeLocations[0];
                var jsCodeLocationPatch = linkTools.getJsCodeLocationPatch(oldJsCodeLocationAssignmentStatement);
                appDelegateContents = appDelegateContents.replace(oldJsCodeLocationAssignmentStatement,
                    jsCodeLocationPatch);
            } else if (jsCodeLocations.length === 2) {
                // If there are two `jsCodeLocation` it means that react-native app version is higher than 0.57.8 or equal
                // and we should replace the second one(Release case) with CodePush call

                appDelegateContents = appDelegateContents.replace(jsCodeLocations[1],
                    newJsCodeLocationAssignmentStatement);
            } else {
                console.log(`AppDelegate isn't compatible for linking`);
            }
        }
    }

    var plistPath = linkTools.getPlistPath();

    if (!plistPath) {
        return Promise.reject(`Couldn't find .plist file. You might need to update it manually \
    Please refer to plugin configuration section for iOS at \
    http://code-push.cn`);
    }

    var plistContents = fs.readFileSync(plistPath, "utf8");

    // 3. Add CodePushDeploymentKey to plist file
    var parsedInfoPlist = plist.parse(plistContents);
    if (parsedInfoPlist.CodePushDeploymentKey) {
        console.log(`"CodePushDeploymentKey" already specified in the plist file.`);

        var answer = module.exports.KEY;
        parsedInfoPlist.CodePushDeploymentKey = answer.iosDeploymentKey || "deployment-key-here";
        plistContents = plist.build(parsedInfoPlist);

        writePatches();
        // return Promise.resolve();
    } else {
        // return inquirer.prompt({
        //     "type": "input",
        //     "name": "iosDeploymentKey",
        //     "message": "What is your CodePush deployment key for iOS (hit <ENTER> to ignore)"
        // }).then(function(answer) {
            var answer = module.exports.KEY;
            parsedInfoPlist.CodePushDeploymentKey = answer.iosDeploymentKey || "deployment-key-here";
            plistContents = plist.build(parsedInfoPlist);

            writePatches();
            // return Promise.resolve();
        // });
    }

    function writePatches() {
        fs.writeFileSync(appDelegatePath, appDelegateContents);
        fs.writeFileSync(plistPath, plistContents);

        var path = require('path');
        var podfilePath = path.join(__dirname, '../../../../../ios/Podfile');
        if(fs.existsSync(podfilePath)){
            if (semver.gte(semver.coerce(reactNativeVersion), "0.60.0")){
                return execPod();
            } else {
                var podfileContent = fs.readFileSync(podfilePath, "utf8");
                var podAry = podfileContent.split('pod ');
                let podReact = undefined, podReactIdx = 0;
                for(let i=0; i<podAry.length; i++){
                    let poditem = podAry[i].trimLeft();
                    if(poditem.startsWith("'React'")){
                        podReact = poditem;
                        podReactIdx = i;
                        break;
                    }
                }
                if(podReact){
                    if (semver.gte(semver.coerce(reactNativeVersion), "0.60.0")){
                        podAry.splice(podReactIdx + 1, 0, "'CodePush', :path => '../node_modules/cpcn-react-native'\r\n\t");
                    }else{
                        let newSpecs = ["'Core'","'CxxBridge'","'DevSupport'","'RCTText'","'RCTNetwork'","'RCTWebSocket'","'RCTAnimation'"];
                        let specs = undefined;
                        var poditemAry = podReact.split('[');
                        if(poditemAry.length > 1){
                            let specsStr = poditemAry[1].substr(0, poditemAry[1].indexOf(']'));
                            specsStr = specsStr.replace(new RegExp('#[^\\n]*\\n', 'gi'), '');
                            specs = specsStr.split(',');
                            specs = specs.map(function(T){
                                return T.trim();
                            });
                        }
                        if(specs){
                            specs.forEach(function(T){
                                if(T && newSpecs.indexOf(T) < 0){
                                    newSpecs.push(T);
                                }
                            });
                        }
                        podAry[podReactIdx] = "'React', :path => '../node_modules/react-native', :subspecs => [" + newSpecs.join(',') + ']\r\n\t';
                        
                        [
                            ["'CodePush'", ":path => '../node_modules/cpcn-react-native'"],
                            ["'Folly'", ":podspec => '../node_modules/react-native/third-party-podspecs/Folly.podspec'"],
                            ["'glog'", ":podspec => '../node_modules/react-native/third-party-podspecs/glog.podspec'"],
                            ["'DoubleConversion'", ":podspec => '../node_modules/react-native/third-party-podspecs/DoubleConversion.podspec'"],
                            ["'yoga'", ":path => '../node_modules/react-native/ReactCommon/yoga'"]
                        ].forEach(function(T){
                            let idx = podAry.findIndex(function(M){
                                return M.trimLeft().startsWith(T[0]);
                            });
                            let val = T[0] + ', ' + T[1] + '\r\n\t';
                            if(idx >= 0){
                                let targetIdx = podAry[idx].indexOf('target ');
                                if(targetIdx >= 0){
                                    val += podAry[idx].substr(targetIdx);
                                }
                                podAry[idx] = val;
                            }else{
                                podAry.splice(podReactIdx + 1, 0, val);
                            }
                        });
                    }
                    fs.writeFileSync(podfilePath, podAry.join('pod '));

                    var reactpodspecPath = path.join(__dirname, '../../../../../node_modules/react-native/React.podspec');
                    if(fs.existsSync(reactpodspecPath)){
                        var reactpodspecContent = fs.readFileSync(reactpodspecPath, "utf8");
                        reactpodspecContent = reactpodspecContent.replace(new RegExp('source[\\s]*=[\\s]*{[\\s\\S]*?}', 'gi'), "source = { :path => '../react-native' }");
                        fs.writeFileSync(reactpodspecPath, reactpodspecContent);
                    }

                    return execPod();
                }else{
                    return Promise.reject('not found Podfile');
                }
            }
        }else{
            return Promise.resolve();
        }
    }

    function execPod() {
        console.log('exec pod install');
        var path = require('path');
        return new Promise(function(resolve, reject){
            var spawn = require("child_process").spawn;
            var podProcess = spawn("pod", ["install"], {
                cwd: path.join(__dirname, '../../../../../ios')
            });
            podProcess.stdout.on("data", function (data) {
                console.log(data.toString().trim());
            });
            podProcess.stderr.on("data", function (data) {
                console.log('ERROR:');
                console.log(data.toString().trim());
            });
            podProcess.on("error", function (err) {
                reject(err);
            });
            podProcess.on("close", function (exitCode) {
                if(exitCode == 0){
                    resolve();
                }else{
                    reject('exec pod install exited with code ' + exitCode + '.\r\nPlease try again');
                }
            });
        });
    }
}