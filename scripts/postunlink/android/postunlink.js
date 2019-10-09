var linkTools = require('../../tools/linkToolsAndroid');
var fs = require("fs");

module.exports = () => {

    console.log("Running android postunlink script");

    var mainApplicationPath = linkTools.getMainApplicationLocation();

    // 1. Remove the getJSBundleFile override
    var getJSBundleFileOverride = linkTools.getJSBundleFileOverride;

    if (mainApplicationPath) {
        var mainApplicationContents = fs.readFileSync(mainApplicationPath, "utf8");
        if (!linkTools.isJsBundleOverridden(mainApplicationContents)) {
            console.log(`"getJSBundleFile" is already removed`);
        } else {
            mainApplicationContents = mainApplicationContents.replace(`${getJSBundleFileOverride}`, "");
            mainApplicationContents = mainApplicationContents.replace('import com.microsoft.codepush.react.CodePush;\r\n', '').replace('import com.microsoft.codepush.react.CodePush;', '');
            fs.writeFileSync(mainApplicationPath, mainApplicationContents);
        }
    } else {
        var mainActivityPath = linkTools.getMainActivityPath();
        if (mainActivityPath) {
            var mainActivityContents = fs.readFileSync(mainActivityPath, "utf8");
            if (!linkTools.isJsBundleOverridden(mainActivityContents)) {
                console.log(`"getJSBundleFile" is already removed`);
            } else {
                mainActivityContents = mainActivityContents.replace(getJSBundleFileOverride, "");
                fs.writeFileSync(mainActivityPath, mainActivityContents);
            }
        } else {
            console.log(`Couldn't find Android application entry point. You might need to update it manually. \
    Please refer to plugin configuration section for Android at \
    http://code-push.cn for more details`);
        }
    }

    // 2. Remove the codepush.gradle build task definitions
    var buildGradlePath = linkTools.getBuildGradlePath();

    if (!fs.existsSync(buildGradlePath)) {
        console.log(`Couldn't find build.gradle file. You might need to update it manually. \
    Please refer to plugin installation section for Android at \
    http://code-push.cn`);
    } else {
        var buildGradleContents = fs.readFileSync(buildGradlePath, "utf8");
        var codePushGradleLink = linkTools.codePushGradleLink;
        if (!~buildGradleContents.indexOf(codePushGradleLink)) {
            console.log(`"codepush.gradle" is already unlinked in the build definition`);
        } else {
            buildGradleContents = buildGradleContents.replace(`${codePushGradleLink}`,"");
            fs.writeFileSync(buildGradlePath, buildGradleContents);
        }
    }

    // 3. Remove deployment key
    var stringsResourcesPath = linkTools.getStringsResourcesPath();
    if (!stringsResourcesPath) {
        return Promise.reject(new Error("Couldn't find strings.xml. You might need to update it manually."));
    } else {
        var stringsResourcesContent = fs.readFileSync(stringsResourcesPath, "utf8");
        var deploymentKeyName = linkTools.deploymentKeyName;
        if (!~stringsResourcesContent.indexOf(deploymentKeyName)) {
            console.log(`${deploymentKeyName} already removed from the strings.xml`);
        } else {
            var AndroidDeploymentKey = stringsResourcesContent.match(/(<string moduleConfig="true" name="reactNativeCodePush_androidDeploymentKey">.*<\/string>)/);
            if (AndroidDeploymentKey) {
                stringsResourcesContent = stringsResourcesContent.replace(`\n\t${AndroidDeploymentKey[0]}`,"");
                fs.writeFileSync(stringsResourcesPath, stringsResourcesContent);
            }
        }
    }


    var path = require('path');
    var podfilePath = path.join(__dirname, '../../../../../ios/Podfile');
    if(fs.existsSync(podfilePath)){
        var podfileContent = fs.readFileSync(podfilePath, "utf8");
        podfileContent = podfileContent.replace(new RegExp("\\t*pod\\s+'CodePush'[\\s\\S]*?\\n", 'gi'), "");
        fs.writeFileSync(podfilePath, podfileContent);
    }


    return Promise.resolve();
}
