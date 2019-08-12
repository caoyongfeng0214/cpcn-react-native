/// <reference path="./typings/assert.d.ts" />
/// <reference path="../node_modules/code-push-plugin-testing-framework/typings/code-push-plugin-testing-framework.d.ts" />
/// <reference path="./typings/mocha.d.ts" />
/// <reference path="./typings/mkdirp.d.ts" />
/// <reference path="./typings/node.d.ts" />
/// <reference path="./typings/q.d.ts" />

"use strict";

import assert = require("assert");
import fs = require("fs");
import mkdirp = require("mkdirp");
import path = require("path");

import { Platform, PluginTestingFramework, ProjectManager, setupTestRunScenario, setupUpdateScenario, ServerUtil, TestBuilder, TestConfig, TestUtil } from "code-push-plugin-testing-framework";

import Q = require("q");

var del = require("del");

//////////////////////////////////////////////////////////////////////////////////////////
// Create the platforms to run the tests on.

interface RNPlatform {
    /**
     * Returns the name of the bundle to be created for this platform.
     */
    getBundleName(): string;
    
    /**
     * Returns whether or not this platform supports diffs.
     */
    isDiffsSupported(): boolean;
    
    /**
     * Returns the path to the binary of the given project on this platform.
     */
    getBinaryPath(projectDirectory: string): string;
    
    /**
     * Installs the platform on the given project.
     */
    installPlatform(projectDirectory: string): Q.Promise<void>;
    
    /**
     * Installs the binary of the given project on this platform.
     */
    installApp(projectDirectory: string): Q.Promise<void>;
    
    /**
     * Builds the binary of the project on this platform.
     */
    buildApp(projectDirectory: string): Q.Promise<void>;
}

class RNAndroid extends Platform.Android implements RNPlatform {
    constructor() {
        super(new Platform.AndroidEmulatorManager());
    }
    
    /**
     * Returns the name of the bundle to be created for this platform.
     */
    getBundleName(): string {
        return "index.android.bundle";
    }
    
    /**
     * Returns whether or not this platform supports diffs.
     */
    isDiffsSupported(): boolean {
        return false;
    }
    
    /**
     * Returns the path to the binary of the given project on this platform.
     */
    getBinaryPath(projectDirectory: string): string {
        return path.join(projectDirectory, TestConfig.TestAppName, "android", "app", "build", "outputs", "apk", "app-release-unsigned.apk");
    }
    
    /**
     * Installs the platform on the given project.
     */
    installPlatform(projectDirectory: string): Q.Promise<void> {
        var innerprojectDirectory: string = path.join(projectDirectory, TestConfig.TestAppName);
        
        //// Set up gradle to build CodePush with the app
        // Add CodePush to android/app/build.gradle
        var buildGradle = path.join(innerprojectDirectory, "android", "app", "build.gradle");
        TestUtil.replaceString(buildGradle,
            "apply from: \"../../node_modules/react-native/react.gradle\"",
            "apply from: \"../../node_modules/react-native/react.gradle\"\napply from: \"" + path.join(innerprojectDirectory, "node_modules", "react-native-code-push", "android", "codepush.gradle") + "\"");
        TestUtil.replaceString(buildGradle,
            "compile \"com.facebook.react:react-native:+\"",
            "compile \"com.facebook.react:react-native:0.25.+\"");
        TestUtil.replaceString(buildGradle,
            "// From node_modules",
            "\n    compile project(':react-native-code-push') // From node_modules");
        // Add CodePush to android/settings.gradle
        TestUtil.replaceString(path.join(innerprojectDirectory, "android", "settings.gradle"),
            "include ':app'",
            "include ':app', ':react-native-code-push'\nproject(':react-native-code-push').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-code-push/android/app')");
        
        //// Set the app version to 1.0.0 instead of 1.0
        // Set the app version to 1.0.0 in android/app/build.gradle
        TestUtil.replaceString(buildGradle, "versionName \"1.0\"", "versionName \"1.0.0\"");
        // Set the app version to 1.0.0 in AndroidManifest.xml
        TestUtil.replaceString(path.join(innerprojectDirectory, "android", "app", "src", "main", "AndroidManifest.xml"), "android:versionName=\"1.0\"", "android:versionName=\"1.0.0\"");
            
        //// Replace the MainActivity.java with the correct server url and deployment key
        var mainActivity = path.join(innerprojectDirectory, "android", "app", "src", "main", "java", "com", "microsoft", "codepush", "test", "MainActivity.java");
        TestUtil.replaceString(mainActivity, TestUtil.CODE_PUSH_TEST_APP_NAME_PLACEHOLDER, TestConfig.TestAppName);
        TestUtil.replaceString(mainActivity, TestUtil.SERVER_URL_PLACEHOLDER, this.getServerUrl());
        TestUtil.replaceString(mainActivity, TestUtil.ANDROID_KEY_PLACEHOLDER, this.getDefaultDeploymentKey());
        
        return Q<void>(null);
    }
    
    /**
     * Installs the binary of the given project on this platform.
     */
    installApp(projectDirectory: string): Q.Promise<void> {
        var androidDirectory: string = path.join(projectDirectory, TestConfig.TestAppName, "android");
        return TestUtil.getProcessOutput("adb install -r " + this.getBinaryPath(projectDirectory), { cwd: androidDirectory }).then(() => { return null; });
    }
    
    /**
     * Builds the binary of the project on this platform.
     */
    buildApp(projectDirectory: string): Q.Promise<void> {
        // In order to run on Android without the package manager, we must create a release APK and then sign it with the debug certificate.
        var androidDirectory: string = path.join(projectDirectory, TestConfig.TestAppName, "android");
        var apkPath = this.getBinaryPath(projectDirectory);
        return TestUtil.getProcessOutput("./gradlew assembleRelease --daemon", { cwd: androidDirectory })
            .then<void>(TestUtil.getProcessOutput.bind(undefined, "jarsigner -verbose -keystore ~/.android/debug.keystore -storepass android -keypass android " + apkPath + " androiddebugkey", { cwd: androidDirectory, noLogStdOut: true })).then(() => { return null; });
    }
}

class RNIOS extends Platform.IOS implements RNPlatform {
    constructor() {
        super(new Platform.IOSEmulatorManager());
    }
    
    /**
     * Returns the name of the bundle to be created for this platform.
     */
    getBundleName(): string {
        return "main.jsbundle";
    }
    
    /**
     * Returns whether or not this platform supports diffs.
     */
    isDiffsSupported(): boolean {
        return true;
    }
    
    /**
     * Returns the path to the binary of the given project on this platform.
     */
    getBinaryPath(projectDirectory: string): string {
        return path.join(projectDirectory, TestConfig.TestAppName, "ios", "build", "Build", "Products", "Release-iphonesimulator", TestConfig.TestAppName + ".app");
    }
    
    /**
     * Installs the platform on the given project.
     */
    installPlatform(projectDirectory: string): Q.Promise<void> {
        var iOSProject: string = path.join(projectDirectory, TestConfig.TestAppName, "ios");
        var infoPlistPath: string = path.join(iOSProject, TestConfig.TestAppName, "Info.plist");
        var appDelegatePath: string = path.join(iOSProject, TestConfig.TestAppName, "AppDelegate.m");
        // Create and install the Podfile
        return TestUtil.getProcessOutput("pod init", { cwd: iOSProject })
            .then(() => { return fs.writeFileSync(path.join(iOSProject, "Podfile"),
                "target '" + TestConfig.TestAppName + "'\n  pod 'React', :path => '../node_modules/react-native', :subspecs => [ 'Core', 'RCTImage', 'RCTNetwork', 'RCTText', 'RCTWebSocket', ]\n  pod 'CodePush', :path => '../node_modules/react-native-code-push'\n"); })
            // Put the IOS deployment key in the Info.plist
            .then(TestUtil.replaceString.bind(undefined, infoPlistPath,
                "</dict>\n</plist>",
                "<key>CodePushDeploymentKey</key>\n\t<string>" + this.getDefaultDeploymentKey() + "</string>\n\t<key>CodePushServerURL</key>\n\t<string>" + this.getServerUrl() + "</string>\n\t</dict>\n</plist>"))
            // Add the correct linker flags to the project.pbxproj
            .then(TestUtil.replaceString.bind(undefined, path.join(iOSProject, TestConfig.TestAppName + ".xcodeproj", "project.pbxproj"), 
                "\"-lc[+][+]\",", "\"-lc++\", \"$(inherited)\""))
            // Install the Pod
            .then(TestUtil.getProcessOutput.bind(undefined, "pod install", { cwd: iOSProject }))
            // Add the correct bundle identifier to the Info.plist
            .then(TestUtil.replaceString.bind(undefined, infoPlistPath, 
                "org[.]reactjs[.]native[.]example[.][$][(]PRODUCT_NAME:rfc1034identifier[)]",
                TestConfig.TestNamespace))
            // Set the app version to 1.0.0 instead of 1.0 in the Info.plist
            .then(TestUtil.replaceString.bind(undefined, infoPlistPath, "1.0", "1.0.0"))
            // Fix the linker flag list in project.pbxproj (pod install adds an extra comma)
            .then(TestUtil.replaceString.bind(undefined, path.join(iOSProject, TestConfig.TestAppName + ".xcodeproj", "project.pbxproj"), 
                "\"[$][(]inherited[)]\",\\s*[)];", "\"$(inherited)\"\n\t\t\t\t);"))
            // Prevent the packager from starting during builds by replacing the script that starts it with nothing.
            .then(TestUtil.replaceString.bind(undefined, 
                path.join(projectDirectory, TestConfig.TestAppName, "node_modules", "react-native", "React", "React.xcodeproj", "project.pbxproj"),
                "shellScript = \".*\";",
                "shellScript = \"\";"))
            // Copy the AppDelegate.m to the project
            .then(TestUtil.copyFile.bind(undefined,
                path.join(TestConfig.templatePath, "ios", TestConfig.TestAppName, "AppDelegate.m"),
                appDelegatePath, true))
            .then<void>(TestUtil.replaceString.bind(undefined, appDelegatePath, TestUtil.CODE_PUSH_TEST_APP_NAME_PLACEHOLDER, TestConfig.TestAppName));
    }
    
    /**
     * Installs the binary of the given project on this platform.
     */
    installApp(projectDirectory: string): Q.Promise<void> {
        return TestUtil.getProcessOutput("xcrun simctl install booted " + this.getBinaryPath(projectDirectory)).then(() => { return null; });
    }
    
    /**
     * Maps project directories to whether or not they have built an IOS project before.
     * 
     * The first build of an IOS project does not always succeed, so we always try again when it fails.
     *
     *  EXAMPLE:
     *  {
     *      "TEMP_DIR/test-run": true,
     *      "TEMP_DIR/updates": false
     *  }
     */
    private static iosFirstBuild: any = {};
    
    /**
     * Builds the binary of the project on this platform.
     */
    buildApp(projectDirectory: string): Q.Promise<void> {
        var iOSProject: string = path.join(projectDirectory, TestConfig.TestAppName, "ios");
        
        return this.getEmulatorManager().getTargetEmulator()
            .then((targetEmulator: string) => {
                var hashRegEx = /[(][0-9A-Z-]*[)]/g;
                var hashWithParen = targetEmulator.match(hashRegEx)[0];
                var hash = hashWithParen.substr(1, hashWithParen.length - 2);
                return TestUtil.getProcessOutput("xcodebuild -workspace " + path.join(iOSProject, TestConfig.TestAppName) + ".xcworkspace -scheme " + TestConfig.TestAppName + 
                    " -configuration Release -destination \"platform=iOS Simulator,id=" + hash + "\" -derivedDataPath build", { cwd: iOSProject, maxBuffer: 1024 * 1000 * 10, noLogStdOut: true });
            })
            .then<void>(
                () => { return null; },
                () => {
                    // The first time an iOS project is built, it fails because it does not finish building libReact.a before it builds the test app.
                    // Simply build again to fix the issue.
                    if (!RNIOS.iosFirstBuild[projectDirectory]) {
                        var iosBuildFolder = path.join(iOSProject, "build");
                        if (fs.existsSync(iosBuildFolder)) {
                            del.sync([iosBuildFolder], { force: true });
                        }
                        RNIOS.iosFirstBuild[projectDirectory] = true;
                        return this.buildApp(projectDirectory);
                    }
                    return null;
                });
    }
}

var supportedTargetPlatforms: Platform.IPlatform[] = [new RNAndroid(), new RNIOS()];

//////////////////////////////////////////////////////////////////////////////////////////
// Create the ProjectManager to use for the tests.

class RNProjectManager extends ProjectManager {
    /**
     * Returns the name of the plugin being tested, ie Cordova or React-Native
     */
    public getPluginName(): string {
        return "React-Native";
    }
    
    /**
     * Copies over the template files into the specified project, overwriting existing files.
     */
    public copyTemplate(templatePath: string, projectDirectory: string): Q.Promise<void> {
        function copyDirectoryRecursively(directoryFrom: string, directoryTo: string): Q.Promise<void> {
            var promises: Q.Promise<void>[] = [];
            
            fs.readdirSync(directoryFrom).forEach(file => {
                var fileStats: fs.Stats;
                var fileInFrom: string = path.join(directoryFrom, file);
                var fileInTo: string = path.join(directoryTo, file);
                
                try { fileStats = fs.statSync(fileInFrom); } catch (e) { /* fs.statSync throws if the file doesn't exist. */ }
                
                // If it is a file, just copy directly
                if (fileStats && fileStats.isFile()) {
                    promises.push(TestUtil.copyFile(fileInFrom, fileInTo, true));
                }
                else {
                    // If it is a directory, create the directory if it doesn't exist on the target and then copy over
                    if (!fs.existsSync(fileInTo)) mkdirp.sync(fileInTo);
                    promises.push(copyDirectoryRecursively(fileInFrom, fileInTo));
                }
            });
            
            // Chain promise so that it maintains Q.Promise<void> type instead of Q.Promise<void[]>
            return Q.all<void>(promises).then(() => { return null; });
        }
        
        return copyDirectoryRecursively(templatePath, path.join(projectDirectory, TestConfig.TestAppName));
    }

    /**
     * Creates a new test application at the specified path, and configures it
     * with the given server URL, android and ios deployment keys.
     */
    public setupProject(projectDirectory: string, templatePath: string, appName: string, appNamespace: string, version?: string): Q.Promise<void> {
        if (fs.existsSync(projectDirectory)) {
            del.sync([projectDirectory], { force: true });
        }
        mkdirp.sync(projectDirectory);

        return TestUtil.getProcessOutput("react-native init " + appName + " --package " + appNamespace, { cwd: projectDirectory })
            .then(this.copyTemplate.bind(this, templatePath, projectDirectory))
            .then<void>(TestUtil.getProcessOutput.bind(undefined, "npm install " + TestConfig.thisPluginPath, { cwd: path.join(projectDirectory, TestConfig.TestAppName) })).then(() => { return null; });
    }
    
    /** JSON mapping project directories to the current scenario
     *
     *  EXAMPLE:
     *  {
     *      "TEMP_DIR/test-run": "scenarios/scenarioCheckForUpdate.js",
     *      "TEMP_DIR/updates": "scenarios/updateSync.js"
     *  }
     */
    private static currentScenario: any = {};
    
    /** JSON mapping project directories to whether or not they've built the current scenario
     *
     *  EXAMPLE:
     *  {
     *      "TEMP_DIR/test-run": "true",
     *      "TEMP_DIR/updates": "false"
     *  }
     */
    private static currentScenarioHasBuilt: any = {};
    
    /**
     * Sets up the scenario for a test in an already existing project.
     */
    public setupScenario(projectDirectory: string, appId: string, templatePath: string, jsPath: string, targetPlatform: Platform.IPlatform, version?: string): Q.Promise<void> {
        // We don't need to anything if it is the current scenario.
        if (RNProjectManager.currentScenario[projectDirectory] === jsPath) return Q<void>(null);
        RNProjectManager.currentScenario[projectDirectory] = jsPath;
        RNProjectManager.currentScenarioHasBuilt[projectDirectory] = false;
        
        var indexHtml = "index.js";
        var templateIndexPath = path.join(templatePath, indexHtml);
        var destinationIndexPath = path.join(projectDirectory, TestConfig.TestAppName, indexHtml);
        
        var scenarioJs = "scenarios/" + jsPath;
        
        console.log("Setting up scenario " + jsPath + " in " + projectDirectory);

        // Copy index html file and replace
        return TestUtil.copyFile(templateIndexPath, destinationIndexPath, true)
            .then<void>(TestUtil.replaceString.bind(undefined, destinationIndexPath, TestUtil.CODE_PUSH_TEST_APP_NAME_PLACEHOLDER, TestConfig.TestAppName))
            .then<void>(TestUtil.replaceString.bind(undefined, destinationIndexPath, TestUtil.SERVER_URL_PLACEHOLDER, targetPlatform.getServerUrl()))
            .then<void>(TestUtil.replaceString.bind(undefined, destinationIndexPath, TestUtil.INDEX_JS_PLACEHOLDER, scenarioJs))
            .then<void>(TestUtil.replaceString.bind(undefined, destinationIndexPath, TestUtil.CODE_PUSH_APP_VERSION_PLACEHOLDER, version));
    }

    /**
     * Creates a CodePush update package zip for a project.
     */
    public createUpdateArchive(projectDirectory: string, targetPlatform: Platform.IPlatform, isDiff?: boolean): Q.Promise<string> {
        var bundleFolder: string = path.join(projectDirectory, TestConfig.TestAppName, "CodePush/");
        var bundleName: string = (<RNPlatform><any>targetPlatform).getBundleName();
        var bundlePath: string = path.join(bundleFolder, bundleName);
        var deferred = Q.defer<string>();
        fs.exists(bundleFolder, (exists) => {
            if (exists) del.sync([bundleFolder], { force: true });
            mkdirp.sync(bundleFolder);
            deferred.resolve(undefined);
        });
        return deferred.promise
            .then(TestUtil.getProcessOutput.bind(undefined, "react-native bundle --platform " + targetPlatform.getName() + " --entry-file index." + targetPlatform.getName() + ".js --bundle-output " + bundlePath + " --assets-dest " + bundleFolder + " --dev false",
                { cwd: path.join(projectDirectory, TestConfig.TestAppName) }))
            .then<string>(TestUtil.archiveFolder.bind(undefined, bundleFolder, "", path.join(projectDirectory, TestConfig.TestAppName, "update.zip"), (<RNPlatform><any>targetPlatform).isDiffsSupported() && isDiff));
    }
    
    /** JSON file containing the platforms the plugin is currently installed for.
     *  Keys must match targetPlatform.getName()!
     *
     *  EXAMPLE:
     *  {
     *      "android": true,
     *      "ios": false
     *  }
     */
    private static platformsJSON: string = "platforms.json";
    
    /**
     * Prepares a specific platform for tests.
     */
    public preparePlatform(projectDirectory: string, targetPlatform: Platform.IPlatform): Q.Promise<void> {
        var deferred= Q.defer<string>();
        
        var platformsJSONPath = path.join(projectDirectory, RNProjectManager.platformsJSON);
        
        // We create a JSON file in the project folder to contain the installed platforms.
        // Check the file to see if the plugin for this platform has been installed and update the file appropriately.
        fs.exists(platformsJSONPath, (exists) => {
            if (!exists) {
                fs.writeFileSync(platformsJSONPath, "{}");
            }
            
            var platformJSON = eval("(" + fs.readFileSync(platformsJSONPath, "utf8") + ")");
            if (platformJSON[targetPlatform.getName()] === true) deferred.reject("Platform " + targetPlatform.getName() + " is already installed in " + projectDirectory + "!");
            else {
                platformJSON[targetPlatform.getName()] = true;
                fs.writeFileSync(platformsJSONPath, JSON.stringify(platformJSON));
                deferred.resolve(undefined);
            }
        });
        
        return deferred.promise
            .then<void>(() => {
                return (<RNPlatform><any>targetPlatform).installPlatform(projectDirectory);
            }, (error: any) => { /* The platform is already installed! */ console.log(error); return null; });
    }
    
    /**
     * Cleans up a specific platform after tests.
     */
    public cleanupAfterPlatform(projectDirectory: string, targetPlatform: Platform.IPlatform): Q.Promise<void> {
        // Can't uninstall from command line, so noop.
        return Q<void>(null);
    }

    /**
     * Runs the test app on the given target / platform.
     */
    public runApplication(projectDirectory: string, targetPlatform: Platform.IPlatform): Q.Promise<void> {
        console.log("Running project in " + projectDirectory + " on " + targetPlatform.getName());
        
        return Q<void>(null)
            .then(() => {
                // Build if this scenario has not yet been built.
                if (!RNProjectManager.currentScenarioHasBuilt[projectDirectory]) {
                    RNProjectManager.currentScenarioHasBuilt[projectDirectory] = true;
                    return (<RNPlatform><any>targetPlatform).buildApp(projectDirectory);
                }
            })
            .then(() => {
                // Uninstall the app so that the installation is clean and no files are left around for each test.
                return targetPlatform.getEmulatorManager().uninstallApplication(TestConfig.TestNamespace);
            })
            .then(() => {
                // Install and launch the app.
                return (<RNPlatform><any>targetPlatform).installApp(projectDirectory)
                    .then<void>(targetPlatform.getEmulatorManager().launchInstalledApplication.bind(undefined, TestConfig.TestNamespace));
            });
    }
};

//////////////////////////////////////////////////////////////////////////////////////////
// Scenarios used in the tests.

const ScenarioCheckForUpdatePath = "scenarioCheckForUpdate.js";
const ScenarioCheckForUpdateCustomKey = "scenarioCheckForUpdateCustomKey.js";
const ScenarioDownloadUpdate = "scenarioDownloadUpdate.js";
const ScenarioInstall = "scenarioInstall.js";
const ScenarioInstallOnResumeWithRevert = "scenarioInstallOnResumeWithRevert.js";
const ScenarioInstallOnRestartWithRevert = "scenarioInstallOnRestartWithRevert.js";
const ScenarioInstallWithRevert = "scenarioInstallWithRevert.js";
const ScenarioInstallRestart2x = "scenarioInstallRestart2x.js";
const ScenarioSync1x = "scenarioSync.js";
const ScenarioSyncResume = "scenarioSyncResume.js";
const ScenarioSyncResumeDelay = "scenarioSyncResumeDelay.js";
const ScenarioSyncRestartDelay = "scenarioSyncResumeDelay.js";
const ScenarioSync2x = "scenarioSync2x.js";
const ScenarioRestart = "scenarioRestart.js";
const ScenarioRestart2x = "scenarioRestart2x.js";
const ScenarioSyncMandatoryDefault = "scenarioSyncMandatoryDefault.js";
const ScenarioSyncMandatoryResume = "scenarioSyncMandatoryResume.js";
const ScenarioSyncMandatoryRestart = "scenarioSyncMandatoryRestart.js";

const UpdateDeviceReady = "updateDeviceReady.js";
const UpdateNotifyApplicationReady = "updateNotifyApplicationReady.js";
const UpdateSync = "updateSync.js";
const UpdateSync2x = "updateSync2x.js";
const UpdateNotifyApplicationReadyConditional = "updateNARConditional.js";

//////////////////////////////////////////////////////////////////////////////////////////
// Initialize the tests.

PluginTestingFramework.initializeTests(new RNProjectManager(), supportedTargetPlatforms,
    (projectManager: ProjectManager, targetPlatform: Platform.IPlatform) => {
        TestBuilder.describe("#window.codePush.checkForUpdate",
            () => {
                TestBuilder.it("window.codePush.checkForUpdate.noUpdate", false,
                    (done: MochaDone) => {
                        var noUpdateResponse = ServerUtil.createDefaultResponse();
                        noUpdateResponse.isAvailable = false;
                        noUpdateResponse.appVersion = "0.0.1";
                        ServerUtil.updateResponse = { updateInfo: noUpdateResponse };

                        ServerUtil.testMessageCallback = (requestBody: any) => {
                            try {
                                assert.equal(requestBody.message, ServerUtil.TestMessage.CHECK_UP_TO_DATE);
                                done();
                            } catch (e) {
                                done(e);
                            }
                        };

                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                    });
                
                TestBuilder.it("window.codePush.checkForUpdate.sendsBinaryHash", false,
                    (done: MochaDone) => {
                        if (!(<RNPlatform><any>targetPlatform).isDiffsSupported()) {
                            console.log(targetPlatform.getName() + " does not send a binary hash!");
                            done();
                            return;
                        }
                        
                        var noUpdateResponse = ServerUtil.createDefaultResponse();
                            noUpdateResponse.isAvailable = false;
                            noUpdateResponse.appVersion = "0.0.1";

                            ServerUtil.updateCheckCallback = (request: any) => {
                                try {
                                    assert(request.query.packageHash);
                                } catch (e) {
                                    done(e);
                                }
                            };
                            
                            ServerUtil.updateResponse = { updateInfo: noUpdateResponse };

                            ServerUtil.testMessageCallback = (requestBody: any) => {
                                try {
                                    assert.equal(requestBody.message, ServerUtil.TestMessage.CHECK_UP_TO_DATE);
                                    done();
                                } catch (e) {
                                    done(e);
                                }
                            };

                            projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                    });
                
                TestBuilder.it("window.codePush.checkForUpdate.noUpdate.updateAppVersion", false,
                    (done: MochaDone) => {
                        var updateAppVersionResponse = ServerUtil.createDefaultResponse();
                        updateAppVersionResponse.updateAppVersion = true;
                        updateAppVersionResponse.appVersion = "2.0.0";

                        ServerUtil.updateResponse = { updateInfo: updateAppVersionResponse };

                        ServerUtil.testMessageCallback = (requestBody: any) => {
                            try {
                                assert.equal(requestBody.message, ServerUtil.TestMessage.CHECK_UP_TO_DATE);
                                done();
                            } catch (e) {
                                done(e);
                            }
                        };

                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                    });
                
                TestBuilder.it("window.codePush.checkForUpdate.update", true,
                    (done: MochaDone) => {
                        var updateResponse = ServerUtil.createUpdateResponse();
                        ServerUtil.updateResponse = { updateInfo: updateResponse };

                        ServerUtil.testMessageCallback = (requestBody: any) => {
                            try {
                                assert.equal(requestBody.message, ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE);
                                assert.notEqual(requestBody.args[0], null);
                                var remotePackage: any = requestBody.args[0];
                                assert.equal(remotePackage.downloadUrl, updateResponse.downloadURL);
                                assert.equal(remotePackage.isMandatory, updateResponse.isMandatory);
                                assert.equal(remotePackage.label, updateResponse.label);
                                assert.equal(remotePackage.packageHash, updateResponse.packageHash);
                                assert.equal(remotePackage.packageSize, updateResponse.packageSize);
                                assert.equal(remotePackage.deploymentKey, targetPlatform.getDefaultDeploymentKey());
                                done();
                            } catch (e) {
                                done(e);
                            }
                        };

                        ServerUtil.updateCheckCallback = (request: any) => {
                            try {
                                assert.notEqual(null, request);
                                assert.equal(request.query.deploymentKey, targetPlatform.getDefaultDeploymentKey());
                            } catch (e) {
                                done(e);
                            }
                        };

                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                    });
                
                TestBuilder.it("window.codePush.checkForUpdate.error", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = "invalid {{ json";

                        ServerUtil.testMessageCallback = (requestBody: any) => {
                            try {
                                assert.equal(requestBody.message, ServerUtil.TestMessage.CHECK_ERROR);
                                done();
                            } catch (e) {
                                done(e);
                            }
                        };

                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                    });
            }, ScenarioCheckForUpdatePath);
        
        TestBuilder.describe("#window.codePush.checkForUpdate.customKey",
            () => {
                TestBuilder.it("window.codePush.checkForUpdate.customKey.update", false,
                (done: MochaDone) => {
                    var updateResponse = ServerUtil.createUpdateResponse();
                    ServerUtil.updateResponse = { updateInfo: updateResponse };

                    ServerUtil.updateCheckCallback = (request: any) => {
                        try {
                            assert.notEqual(null, request);
                            assert.equal(request.query.deploymentKey, "CUSTOM-DEPLOYMENT-KEY");
                            done();
                        } catch (e) {
                            done(e);
                        }
                    };

                    projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                });
            }, ScenarioCheckForUpdateCustomKey);
            
        TestBuilder.describe("#remotePackage.download",
            () => {
                TestBuilder.it("remotePackage.download.success", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* pass the path to any file for download (here, index.js) to make sure the download completed callback is invoked */
                        ServerUtil.updatePackagePath = path.join(TestConfig.templatePath, "index.js");
                        
                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                        
                        ServerUtil.expectTestMessages([
                            ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                            ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED])
                            .then(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("remotePackage.download.error", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* pass an invalid update url */
                        ServerUtil.updateResponse.updateInfo.downloadURL = "invalid_url";
                        
                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                        
                        ServerUtil.expectTestMessages([
                            ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                            ServerUtil.TestMessage.DOWNLOAD_ERROR])
                            .then(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioDownloadUpdate);
            
        TestBuilder.describe("#localPackage.install",
            () => {
                // // CHANGE THIS TEST CASE, accepts both a jsbundle and a zip
                // TestBuilder.it("localPackage.install.unzip.error",
                //     (done: MochaDone) => {
                //         ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                //         /* pass an invalid zip file, here, index.js */
                //         ServerUtil.updatePackagePath = path.join(TestConfig.templatePath, "index.js");
                        
                //         var deferred = Q.defer<void>();
                //         deferred.promise.then(() => { done(); }, (e) => { done(e); });

                //         ServerUtil.testMessageCallback = PluginTestingFramework.verifyMessages([
                //             ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                //             ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                //             ServerUtil.TestMessage.INSTALL_ERROR], deferred);

                //         projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                //     }, false),
                
                TestBuilder.it("localPackage.install.handlesDiff.againstBinary", false,
                    (done: MochaDone) => {
                        if (!(<RNPlatform><any>targetPlatform).isDiffsSupported()) {
                            console.log(targetPlatform.getName() + " does not support diffs!");
                            done();
                            return;
                        }
                        
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Diff Update 1")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* run the app again to ensure it was not reverted */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("localPackage.install.immediately", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Update 1")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* run the app again to ensure it was not reverted */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioInstall);
            
        TestBuilder.describe("#localPackage.install.revert",
            () => {
                TestBuilder.it("localPackage.install.revert.dorevert", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (bad update)")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart the app to ensure it was reverted and send it another update */
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart the app again to ensure it was reverted again and send the same update and expect it to reject it */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.UPDATE_FAILED_PREVIOUSLY]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("localPackage.install.revert.norevert", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Update 1 (good update)")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* run the app again to ensure it was not reverted */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioInstallWithRevert),
        
        TestBuilder.describe("#localPackage.installOnNextResume",
            () => {
                TestBuilder.it("localPackage.installOnNextResume.dorevert", true,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* resume the application */
                                targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart to revert it */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.UPDATE_FAILED_PREVIOUSLY]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("localPackage.installOnNextResume.norevert", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Update 1 (good update)")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* resume the application */
                                targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart to make sure it did not revert */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioInstallOnResumeWithRevert);
            
        TestBuilder.describe("localPackage installOnNextRestart",
            () => {
                TestBuilder.it("localPackage.installOnNextRestart.dorevert", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* restart the application */
                                console.log("Update hash: " + ServerUtil.updateResponse.updateInfo.packageHash);
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart the application */
                                console.log("Update hash: " + ServerUtil.updateResponse.updateInfo.packageHash);
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.UPDATE_FAILED_PREVIOUSLY]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("localPackage.installOnNextRestart.norevert", true,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Update 1 (good update)")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* "resume" the application - run it again */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* run again to make sure it did not revert */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("localPackage.installOnNextRestart.revertToPrevious", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        /* create an update */
                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReadyConditional, "Update 1 (good update)")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* run good update, set up another (bad) update */
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                                setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 2 (bad update)")
                                    .then(() => { return targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace); });
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED]);
                            })
                            .then<void>(() => {
                                /* run the bad update without calling notifyApplicationReady */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* run the good update and don't call notifyApplicationReady - it should not revert */
                                ServerUtil.testMessageResponse = ServerUtil.TestMessageResponse.SKIP_NOTIFY_APPLICATION_READY;
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE, 
                                    ServerUtil.TestMessage.SKIPPED_NOTIFY_APPLICATION_READY]);
                            })
                            .then<void>(() => {
                                /* run the application again */
                                ServerUtil.testMessageResponse = undefined;
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE, 
                                    ServerUtil.TestMessage.UPDATE_FAILED_PREVIOUSLY]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioInstallOnRestartWithRevert);
            
        TestBuilder.describe("#codePush.restartApplication",
            () => {
                TestBuilder.it("codePush.restartApplication.checkPackages", true,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupUpdateScenario(projectManager, targetPlatform, UpdateNotifyApplicationReady, "Update 1")
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.PENDING_PACKAGE, [null]),
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.CURRENT_PACKAGE, [null]),
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UPDATE_INSTALLED]),
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.PENDING_PACKAGE, [ServerUtil.updateResponse.updateInfo.packageHash]),
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.CURRENT_PACKAGE, [null]),
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .then<void>(() => {
                                /* restart the application */
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            }, ScenarioRestart);
            
        TestBuilder.describe("#codePush.restartApplication.2x",
            () => {
                TestBuilder.it("blocks when a restart is in progress and doesn't crash if there is a pending package", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                        setupTestRunScenario(projectManager, targetPlatform, ScenarioInstallRestart2x)
                            .then(setupUpdateScenario.bind(this, projectManager, targetPlatform, UpdateDeviceReady, "Update 1"))
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                    
                TestBuilder.it("doesn't block when the restart is ignored", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                        setupTestRunScenario(projectManager, targetPlatform, ScenarioRestart2x)
                            .then(setupUpdateScenario.bind(this, projectManager, targetPlatform, UpdateDeviceReady, "Update 1"))
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.CHECK_UPDATE_AVAILABLE,
                                    ServerUtil.TestMessage.DOWNLOAD_SUCCEEDED,
                                    ServerUtil.TestMessage.UPDATE_INSTALLED,
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            });
            
        TestBuilder.describe("#window.codePush.sync",
            () => {
                // We test the functionality with sync twice--first, with sync only called once,
                // then, with sync called again while the first sync is still running.
                TestBuilder.describe("#window.codePush.sync 1x",
                    () => {
                        // Tests where sync is called just once
                        TestBuilder.it("window.codePush.sync.noupdate", false,
                            (done: MochaDone) => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.checkerror", false,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = "invalid {{ json";

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_ERROR])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.downloaderror", false,
                            (done: MochaDone) => {
                                var invalidUrlResponse = ServerUtil.createUpdateResponse();
                                invalidUrlResponse.downloadURL = path.join(TestConfig.templatePath, "invalid_path.zip");
                                ServerUtil.updateResponse = { updateInfo: invalidUrlResponse };

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_ERROR])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.dorevert", false,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                            
                                /* create an update */
                                setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (bad update)")
                                    .then<void>((updatePath: string) => {
                                        ServerUtil.updatePackagePath = updatePath;
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                                    })
                                    .then<void>(() => {
                                        targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.update", false,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                                /* create an update */
                                setupUpdateScenario(projectManager, targetPlatform, UpdateSync, "Update 1 (good update)")
                                    .then<void>((updatePath: string) => {
                                        ServerUtil.updatePackagePath = updatePath;
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .then<void>(() => {
                                        // restart the app and make sure it didn't roll out!
                                        var noUpdateResponse = ServerUtil.createDefaultResponse();
                                        noUpdateResponse.isAvailable = false;
                                        noUpdateResponse.appVersion = "0.0.1";
                                        ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                        targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                        return ServerUtil.expectTestMessages([
                                            ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                    }, ScenarioSync1x);
                    
                TestBuilder.describe("#window.codePush.sync 2x",
                    () => {
                        // Tests where sync is called again before the first sync finishes
                        TestBuilder.it("window.codePush.sync.2x.noupdate", false,
                            (done: MochaDone) => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.2x.checkerror", false,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = "invalid {{ json";

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_ERROR])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.2x.downloaderror", false,
                            (done: MochaDone) => {
                                var invalidUrlResponse = ServerUtil.createUpdateResponse();
                                invalidUrlResponse.downloadURL = path.join(TestConfig.templatePath, "invalid_path.zip");
                                ServerUtil.updateResponse = { updateInfo: invalidUrlResponse };

                                Q({})
                                    .then<void>(p => {
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_ERROR])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.2x.dorevert", false,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };
                        
                                /* create an update */
                                setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (bad update)")
                                    .then<void>((updatePath: string) => {
                                        ServerUtil.updatePackagePath = updatePath;
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                                    })
                                    .then<void>(() => {
                                        targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                        
                        TestBuilder.it("window.codePush.sync.2x.update", true,
                            (done: MochaDone) => {
                                ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                                /* create an update */
                                setupUpdateScenario(projectManager, targetPlatform, UpdateSync2x, "Update 1 (good update)")
                                    .then<void>((updatePath: string) => {
                                        ServerUtil.updatePackagePath = updatePath;
                                        projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                        return ServerUtil.expectTestMessages([
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .then<void>(() => {
                                        // restart the app and make sure it didn't roll out!
                                        var noUpdateResponse = ServerUtil.createDefaultResponse();
                                        noUpdateResponse.isAvailable = false;
                                        noUpdateResponse.appVersion = "0.0.1";
                                        ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                        targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                        return ServerUtil.expectTestMessages([
                                            ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_IN_PROGRESS]),
                                            new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                                    })
                                    .done(() => { done(); }, (e) => { done(e); });
                            });
                    }, ScenarioSync2x);
            });
        
        TestBuilder.describe("#window.codePush.sync minimum background duration tests",
            () => {
                TestBuilder.it("defaults to no minimum", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncResume).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateSync, "Update 1 (good update)");
                            })
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UPDATE_INSTALLED])]);
                            })
                            .then<void>(() => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                
                TestBuilder.it("min background duration 5s", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncResumeDelay).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateSync, "Update 1 (good update)");
                            })
                            .then((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UPDATE_INSTALLED])]);
                            })
                            .then(() => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                return targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace, 3 * 1000);
                            })
                            .then(() => {
                                targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace, 6 * 1000);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                    
                TestBuilder.it("has no effect on restart", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncRestartDelay).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateSync, "Update 1 (good update)");
                            })
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UPDATE_INSTALLED])]);
                            })
                            .then<void>(() => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                targetPlatform.getEmulatorManager().restartApplication(TestConfig.TestNamespace);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE,
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UP_TO_DATE])]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            });
            
        TestBuilder.describe("#window.codePush.sync mandatory install mode tests",
            () => {
                TestBuilder.it("defaults to IMMEDIATE", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(true, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncMandatoryDefault).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (good update)");
                            })
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                    
                TestBuilder.it("works correctly when update is mandatory and mandatory install mode is specified", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(true, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncMandatoryResume).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (good update)");
                            })
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([
                                    new ServerUtil.AppMessage(ServerUtil.TestMessage.SYNC_STATUS, [ServerUtil.TestMessage.SYNC_UPDATE_INSTALLED])]);
                            })
                            .then<void>(() => {
                                var noUpdateResponse = ServerUtil.createDefaultResponse();
                                noUpdateResponse.isAvailable = false;
                                noUpdateResponse.appVersion = "0.0.1";
                                ServerUtil.updateResponse = { updateInfo: noUpdateResponse };
                                targetPlatform.getEmulatorManager().resumeApplication(TestConfig.TestNamespace, 5 * 1000);
                                return ServerUtil.expectTestMessages([
                                    ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
                    
                TestBuilder.it("has no effect on updates that are not mandatory", false,
                    (done: MochaDone) => {
                        ServerUtil.updateResponse = { updateInfo: ServerUtil.createUpdateResponse(false, targetPlatform) };

                        setupTestRunScenario(projectManager, targetPlatform, ScenarioSyncMandatoryRestart).then<string>(() => {
                                return setupUpdateScenario(projectManager, targetPlatform, UpdateDeviceReady, "Update 1 (good update)");
                            })
                            .then<void>((updatePath: string) => {
                                ServerUtil.updatePackagePath = updatePath;
                                projectManager.runApplication(TestConfig.testRunDirectory, targetPlatform);
                                return ServerUtil.expectTestMessages([ServerUtil.TestMessage.DEVICE_READY_AFTER_UPDATE]);
                            })
                            .done(() => { done(); }, (e) => { done(e); });
                    });
            });
    });