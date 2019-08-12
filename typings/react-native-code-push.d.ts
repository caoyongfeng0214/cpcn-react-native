export type DownloadProgressCallback = (progress: DownloadProgress) => void;
export type SyncStatusChangedCallback = (status: CodePush.SyncStatus) => void;
export type HandleBinaryVersionMismatchCallback = (update: RemotePackage) => void;

export interface CodePushOptions extends SyncOptions {
    /**
     * Specifies when you would like to synchronize updates with the CodePush server.
     * Defaults to codePush.CheckFrequency.ON_APP_START.
     */
    checkFrequency: CodePush.CheckFrequency;
}

export interface DownloadProgress {
    /**
     * The total number of bytes expected to be received for this update.
     */
    totalBytes: number;

    /**
     * The number of bytes downloaded thus far.
     */
    receivedBytes: number;
}

export interface LocalPackage extends Package {
    /**
     * Installs the update by saving it to the location on disk where the runtime expects to find the latest version of the app.
     *
     * @param installMode Indicates when you would like the update changes to take affect for the end-user.
     * @param minimumBackgroundDuration For resume-based installs, this specifies the number of seconds the app needs to be in the background before forcing a restart. Defaults to 0 if unspecified.
     */
    install(installMode: CodePush.InstallMode, minimumBackgroundDuration?: number): Promise<void>;
}

export interface Package {
    /**
     * The app binary version that this update is dependent on. This is the value that was
     * specified via the appStoreVersion parameter when calling the CLI's release command.
     */
    appVersion: string;

    /**
     * The deployment key that was used to originally download this update.
     */
    deploymentKey: string;

    /**
     * The description of the update. This is the same value that you specified in the CLI when you released the update.
     */
    description: string;

    /**
     * Indicates whether this update has been previously installed but was rolled back.
     */
    failedInstall: boolean;

    /**
     * Indicates whether this is the first time the update has been run after being installed.
     */
    isFirstRun: boolean;

    /**
     * Indicates whether the update is considered mandatory. This is the value that was specified in the CLI when the update was released.
     */
    isMandatory: boolean;

    /**
     * Indicates whether this update is in a "pending" state. When true, that means the update has been downloaded and installed, but the app restart
     * needed to apply it hasn't occurred yet, and therefore, its changes aren't currently visible to the end-user.
     */
    isPending: boolean;

    /**
     * The internal label automatically given to the update by the CodePush server. This value uniquely identifies the update within its deployment.
     */
    label: string;

    /**
     * The SHA hash value of the update.
     */
    packageHash: string;

    /**
     * The size of the code contained within the update, in bytes.
     */
    packageSize: number;
}

export interface RemotePackage extends Package {
    /**
     * Downloads the available update from the CodePush service.
     *
     * @param downloadProgressCallback An optional callback that allows tracking the progress of the update while it is being downloaded.
     */
    download(downloadProgressCallback?: DownloadProgressCallback): Promise<LocalPackage>;

    /**
     * The URL at which the package is available for download.
     */
    downloadUrl: string;
}

export interface SyncOptions {
    /**
     * Specifies the deployment key you want to query for an update against. By default, this value is derived from the Info.plist
     * file (iOS) and MainActivity.java file (Android), but this option allows you to override it from the script-side if you need to
     * dynamically use a different deployment for a specific call to sync.
     */
    deploymentKey?: string;

    /**
     * Specifies when you would like to install optional updates (i.e. those that aren't marked as mandatory).
     * Defaults to codePush.InstallMode.ON_NEXT_RESTART.
     */
    installMode?: CodePush.InstallMode;

    /**
     * Specifies when you would like to install updates which are marked as mandatory.
     * Defaults to codePush.InstallMode.IMMEDIATE.
     */
    mandatoryInstallMode?: CodePush.InstallMode;

    /**
     * Specifies the minimum number of seconds that the app needs to have been in the background before restarting the app. This property
     * only applies to updates which are installed using `InstallMode.ON_NEXT_RESUME`, and can be useful for getting your update in front
     * of end users sooner, without being too obtrusive. Defaults to `0`, which has the effect of applying the update immediately after a
     * resume, regardless how long it was in the background.
     */
    minimumBackgroundDuration?: number;

    /**
     * An "options" object used to determine whether a confirmation dialog should be displayed to the end user when an update is available,
     * and if so, what strings to use. Defaults to null, which has the effect of disabling the dialog completely. Setting this to any truthy
     * value will enable the dialog with the default strings, and passing an object to this parameter allows enabling the dialog as well as
     * overriding one or more of the default strings.
     */
    updateDialog?: UpdateDialog;

    /**
     * The rollback retry mechanism allows the application to attempt to reinstall an update that was previously rolled back (with the restrictions
     * specified in the options). It is an "options" object used to determine whether a rollback retry should occur, and if so, what settings to use
     * for the rollback retry. This defaults to null, which has the effect of disabling the retry mechanism. Setting this to any truthy value will enable
     * the retry mechanism with the default settings, and passing an object to this parameter allows enabling the rollback retry as well as overriding
     * one or more of the default values.
     */
    rollbackRetryOptions?: RollbackRetryOptions;
}

export interface UpdateDialog {
    /**
     * Indicates whether you would like to append the description of an available release to the
     * notification message which is displayed to the end user. Defaults to false.
     */
    appendReleaseDescription?: boolean;

    /**
     * Indicates the string you would like to prefix the release description with, if any, when
     * displaying the update notification to the end user. Defaults to " Description: "
     */
    descriptionPrefix?: string;

    /**
     * The text to use for the button the end user must press in order to install a mandatory update. Defaults to "Continue".
     */
    mandatoryContinueButtonLabel?: string;

    /**
     * The text used as the body of an update notification, when the update is specified as mandatory.
     * Defaults to "An update is available that must be installed.".
     */
    mandatoryUpdateMessage?: string;

    /**
     * The text to use for the button the end user can press in order to ignore an optional update that is available. Defaults to "Ignore".
     */
    optionalIgnoreButtonLabel?: string;

    /**
     * The text to use for the button the end user can press in order to install an optional update. Defaults to "Install".
     */
    optionalInstallButtonLabel?: string;

    /**
     * The text used as the body of an update notification, when the update is optional. Defaults to "An update is available. Would you like to install it?".
     */
    optionalUpdateMessage?: string;

    /**
     * The text used as the header of an update notification that is displayed to the end user. Defaults to "Update available".
     */
    title?: string;
}

export interface RollbackRetryOptions {
    /**
     * Specifies the minimum time in hours that the app will wait after the latest rollback
     * before attempting to reinstall same rolled-back package. Defaults to `24`.
     */
    delayInHours?: number;

    /**
     * Specifies the maximum number of retry attempts that the app can make before it stops trying.
     * Cannot be less than `1`. Defaults to `1`.
     */
    maxRetryAttempts?: number;
}

export interface StatusReport {
    /**
     * Whether the deployment succeeded or failed.
     */
    status: CodePush.DeploymentStatus;

    /**
     * The version of the app that was deployed (for a native app upgrade).
     */
    appVersion?: string;

    /**
     * Details of the package that was deployed (or attempted to).
     */
    package?: Package;

    /**
     * Deployment key used when deploying the previous package.
     */
    previousDeploymentKey?: string;

    /**
     * The label (v#) of the package that was upgraded from.
     */
    previousLabelOrAppVersion?: string;
}

/**
 * Decorates a React Component configuring it to sync for updates with the CodePush server.
 *
 * @param options Options used to configure the end-user sync and update experience (e.g. when to check for updates?, show an prompt?, install the update immediately?).
 */
declare function CodePush(options?: CodePushOptions): (x: any) => any;

declare namespace CodePush {
    /**
     * Represents the default settings that will be used by the sync method if
     * an update dialog is configured to be displayed.
     */
    var DEFAULT_UPDATE_DIALOG: UpdateDialog;

    /**
     * Asks the CodePush service whether the configured app deployment has an update available.
     *
     * @param deploymentKey The deployment key to use to query the CodePush server for an update.
     * 
     * @param handleBinaryVersionMismatchCallback An optional callback for handling target binary version mismatch
     */
    function checkForUpdate(deploymentKey?: string, handleBinaryVersionMismatchCallback?: HandleBinaryVersionMismatchCallback): Promise<RemotePackage | null>;

    /**
     * Retrieves the metadata for an installed update (e.g. description, mandatory).
     *
     * @param updateState The state of the update you want to retrieve the metadata for. Defaults to UpdateState.RUNNING.
     */
    function getUpdateMetadata(updateState?: UpdateState) : Promise<LocalPackage|null>;

    /**
     * Notifies the CodePush runtime that an installed update is considered successful.
     */
    function notifyAppReady(): Promise<StatusReport|void>;

    /**
     * Allow CodePush to restart the app.
     */
    function allowRestart(): void;

    /**
     * Forbid CodePush to restart the app.
     */
    function disallowRestart(): void;

    /**
     * Clear all downloaded CodePush updates.
     * This is useful when switching to a different deployment which may have an older release than the current package.
     * Note: we don’t recommend to use this method in scenarios other than that (CodePush will call
     * this method automatically when needed in other cases) as it could lead to unpredictable behavior.
     */
    function clearUpdates(): void;

    /**
     * Immediately restarts the app.
     *
     * @param onlyIfUpdateIsPending Indicates whether you want the restart to no-op if there isn't currently a pending update.
     */
    function restartApp(onlyIfUpdateIsPending?: boolean): void;

    /**
     * Allows checking for an update, downloading it and installing it, all with a single call.
     *
     * @param options Options used to configure the end-user update experience (e.g. show an prompt?, install the update immediately?).
     * @param syncStatusChangedCallback An optional callback that allows tracking the status of the sync operation, as opposed to simply checking the resolved state via the returned Promise.
     * @param downloadProgressCallback An optional callback that allows tracking the progress of an update while it is being downloaded.
     * @param handleBinaryVersionMismatchCallback An optional callback for handling target binary version mismatch
     */
    function sync(options?: SyncOptions, syncStatusChangedCallback?: SyncStatusChangedCallback, downloadProgressCallback?: DownloadProgressCallback, handleBinaryVersionMismatchCallback?: HandleBinaryVersionMismatchCallback): Promise<SyncStatus>;

    /**
     * Indicates when you would like an installed update to actually be applied.
     */
    enum InstallMode {
        /**
         * Indicates that you want to install the update and restart the app immediately.
         */
        IMMEDIATE,

        /**
         * Indicates that you want to install the update, but not forcibly restart the app.
         */
        ON_NEXT_RESTART,

        /**
         * Indicates that you want to install the update, but don't want to restart the
         * app until the next time the end user resumes it from the background.
         */
        ON_NEXT_RESUME,

        /**
         * Indicates that you want to install the update when the app is in the background,
         * but only after it has been in the background for "minimumBackgroundDuration" seconds (0 by default),
         * so that user context isn't lost unless the app suspension is long enough to not matter.
         */
        ON_NEXT_SUSPEND
    }

    /**
     * Indicates the current status of a sync operation.
     */
    enum SyncStatus {
        /**
         * The app is up-to-date with the CodePush server.
         */
        UP_TO_DATE,
            
        /**
         * An available update has been installed and will be run either immediately after the
         * syncStatusChangedCallback function returns or the next time the app resumes/restarts,
         * depending on the InstallMode specified in SyncOptions
         */
        UPDATE_INSTALLED,
            
        /**
         * The app had an optional update which the end user chose to ignore.
         * (This is only applicable when the updateDialog is used)
         */
        UPDATE_IGNORED,
            
        /**
         * The sync operation encountered an unknown error.
         */
        UNKNOWN_ERROR,
        
        /**
         * There is an ongoing sync operation running which prevents the current call from being executed.
         */
        SYNC_IN_PROGRESS,
            
        /**
         * The CodePush server is being queried for an update.
         */
        CHECKING_FOR_UPDATE,

        /**
         * An update is available, and a confirmation dialog was shown
         * to the end user. (This is only applicable when the updateDialog is used)
         */
        AWAITING_USER_ACTION,

        /**
         * An available update is being downloaded from the CodePush server.
         */
        DOWNLOADING_PACKAGE,

        /**
         * An available update was downloaded and is about to be installed.
         */
        INSTALLING_UPDATE
    }

    /**
     * Indicates the state that an update is currently in.
     */
    enum UpdateState {
        /**
         * Indicates that an update represents the
         * version of the app that is currently running.
         */
        RUNNING,

        /**
         * Indicates than an update has been installed, but the
         * app hasn't been restarted yet in order to apply it.
         */
        PENDING,

        /**
         * Indicates than an update represents the latest available
         * release, and can be either currently running or pending.
         */
        LATEST
    }

    /**
     * Indicates the status of a deployment (after installing and restarting).
     */
    enum DeploymentStatus {
        /**
         * The deployment failed (and was rolled back).
         */
        FAILED,

        /**
         * The deployment succeeded.
         */
        SUCCEEDED
    }

    /**
     * Indicates when you would like to check for (and install) updates from the CodePush server.
     */
    enum CheckFrequency {
        /**
         * When the app is fully initialized (or more specifically, when the root component is mounted).
         */
        ON_APP_START,

        /**
         * When the app re-enters the foreground.
         */
        ON_APP_RESUME,

        /**
         * Don't automatically check for updates, but only do it when codePush.sync() is manully called inside app code.
         */
        MANUAL
    }
}

export default CodePush;
