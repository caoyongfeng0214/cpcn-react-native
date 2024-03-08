var linkTools = require('../../tools/linkToolsAndroid');
var fs = require("fs");
var inquirer = require('inquirer');

module.exports = () => {

    console.log("Running android postlink script");

    var buildGradlePath = linkTools.getBuildGradlePath();
    var settingsGradlePath = linkTools.getSettingsGradlePath();
    var mainApplicationPath = linkTools.getMainApplicationLocation();

    // 1. Add the getJSBundleFile override
    var getJSBundleFileOverride = linkTools.getJSBundleFileOverride;

    if (mainApplicationPath) {
        var isKt = mainApplicationPath.endsWith('.kt');

        var mainApplicationContents = fs.readFileSync(mainApplicationPath, "utf8");
        
        if(isKt) {
            getJSBundleFileOverride = 'override fun getJSBundleFile(): String = CodePush.getJSBundleFile()';
            let replaced = false;
            if(mainApplicationContents.indexOf(getJSBundleFileOverride) < 0) {
                replaced = true;
                var reactNativeHostInstantiation = 'object : DefaultReactNativeHost(this) {';
                mainApplicationContents = mainApplicationContents.replace(reactNativeHostInstantiation,
                    `${reactNativeHostInstantiation}\r\n\t\t\t\t${getJSBundleFileOverride}\r\n`);
            }
            var importCodePush = 'import com.microsoft.codepush.react.CodePush;';
            if(mainApplicationContents.indexOf(importCodePush) < 0) {
                replaced = true;
                mainApplicationContents = mainApplicationContents.replace('class MainApplication', `${importCodePush}\r\nclass MainApplication`);
            }
            if(replaced) {
                fs.writeFileSync(mainApplicationPath, mainApplicationContents);
            }
        } else {
            if (linkTools.isJsBundleOverridden(mainApplicationContents)) {
                console.log(`"getJSBundleFile" is already overridden`);
            } else {
                var reactNativeHostInstantiation = linkTools.reactNativeHostInstantiation;
                if(mainApplicationContents.indexOf(reactNativeHostInstantiation) < 0) {
                    reactNativeHostInstantiation = 'new DefaultReactNativeHost(this) {';
                }
                mainApplicationContents = mainApplicationContents.replace(reactNativeHostInstantiation,
                    `${reactNativeHostInstantiation}${getJSBundleFileOverride}`);
                if(mainApplicationContents.indexOf('import com.microsoft.codepush.react.CodePush;') < 0){
                    mainApplicationContents = mainApplicationContents.replace("public class MainApplication", "import com.microsoft.codepush.react.CodePush;\r\npublic class MainApplication");
                }
                fs.writeFileSync(mainApplicationPath, mainApplicationContents);
            }
        }
    } else {
        var mainActivityPath = linkTools.getMainActivityPath();
        if (mainActivityPath) {
            var mainActivityContents = fs.readFileSync(mainActivityPath, "utf8");
            if (linkTools.isJsBundleOverridden(mainActivityContents)) {
                console.log(`"getJSBundleFile" is already overridden`);
            } else {
                var mainActivityClassDeclaration = linkTools.mainActivityClassDeclaration;
                mainActivityContents = mainActivityContents.replace(mainActivityClassDeclaration,
                    `${mainActivityClassDeclaration}${getJSBundleFileOverride}`);
                fs.writeFileSync(mainActivityPath, mainActivityContents);
            }
        } else {
            return Promise.reject(`Couldn't find Android application entry point. You might need to update it manually. \
    Please refer to plugin configuration section for Android at \
    http://code-push.cn for more details`);
        }
    }

    if (!fs.existsSync(buildGradlePath)) {
        return Promise.reject(`Couldn't find build.gradle file. You might need to update it manually. \
    Please refer to plugin installation section for Android at \
    http://code-push.cn`);
    }

    // 2. Add the codepush.gradle build task definitions
    var buildGradleContents = fs.readFileSync(buildGradlePath, "utf8");
    var reactGradleLinks = buildGradleContents.match(/\napply from: ["'].*?react\.gradle["']/);
    if(reactGradleLinks && reactGradleLinks.length > 0) {
        var reactGradleLink = reactGradleLinks[0];
        var codePushGradleLink = linkTools.codePushGradleLink;
        if (~buildGradleContents.indexOf(codePushGradleLink)) {
            console.log(`"codepush.gradle" is already linked in the build definition`);
        } else {
            buildGradleContents = buildGradleContents.replace(reactGradleLink,
                `${reactGradleLink}${codePushGradleLink}`);
            fs.writeFileSync(buildGradlePath, buildGradleContents);
        }
    } else {
        if(buildGradleContents.indexOf('buildType.resValue \'string\', "CODE_PUSH_APK_BUILD_TIME"') < 0) {
            buildGradleContents += linkTools.codePushGradleLink2;
            fs.writeFileSync(buildGradlePath, buildGradleContents);
        }
    }

    if (fs.existsSync(settingsGradlePath)) {
        var settingsGradleContents = fs.readFileSync(settingsGradlePath, "utf8");
        var includeApp = settingsGradleContents.match(/include ["']:app["']/)[0];
        var settingsGradeInclude = linkTools.settingsGradeInclude;
        if(settingsGradleContents.indexOf(settingsGradeInclude) < 0) {
            settingsGradleContents = settingsGradleContents.replace(includeApp,
                `${settingsGradeInclude}`);
            settingsGradleContents += (settingsGradleContents[settingsGradleContents.length - 1] == '\n' ? '' : '\n') + "project(':cpcn-react-native').projectDir = new File(rootProject.projectDir, '../node_modules/cpcn-react-native/android/app')";
            fs.writeFileSync(settingsGradlePath, settingsGradleContents);
        }
    }

    //3. Add deployment key
    var stringsResourcesPath = linkTools.getStringsResourcesPath();
    if (!stringsResourcesPath) {
        return Promise.reject(new Error(`Couldn't find strings.xml. You might need to update it manually.`));
    } else {
        var stringsResourcesContent = fs.readFileSync(stringsResourcesPath, "utf8");
        var deploymentKeyName = linkTools.deploymentKeyName;
        if (~stringsResourcesContent.indexOf(deploymentKeyName)) {
            console.log(`${deploymentKeyName} already specified in the strings.xml`);
        } else {
            // return inquirer.prompt({
            //     "type": "input",
            //     "name": "androidDeploymentKey",
            //     "message": "What is your CodePush deployment key for Android (hit <ENTER> to ignore)"
            // }).then(function(answer) {
                var answer = module.exports.KEY;
                var insertAfterString = "<resources>";
                var deploymentKeyString = `\t<string moduleConfig="true" name="${deploymentKeyName}">${answer.androidDeploymentKey || "deployment-key-here"}</string>`;
                stringsResourcesContent = stringsResourcesContent.replace(insertAfterString,`${insertAfterString}\n${deploymentKeyString}`);
                fs.writeFileSync(stringsResourcesPath, stringsResourcesContent);
                return Promise.resolve();
            // });
        }
    }

    return Promise.resolve();
}
