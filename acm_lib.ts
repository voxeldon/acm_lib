/*  
 Author: Donthedev <https://github.com/voxeldon> 
**************************************************
 Copyright (c) Voxel Media Co - Voxel Lab Studios
**************************************************
*/
import { Player, Scoreboard, ScoreboardIdentity, ScoreboardObjective, ScriptEventCommandMessageAfterEvent, system, world } from "@minecraft/server";

/**
 * Represents a text field widget used in settings.
 */
export interface TextFieldWidget {
    /** The label displayed for the text field. */
    label: string;
    /** Placeholder text displayed inside the text field. */
    placeholder: string;
    /** The current value of the text field (optional). */
    value?: string;
}

/**
 * Represents a dropdown widget used in settings.
 */
export interface DropdownWidget {
    /** The label displayed for the dropdown. */
    label: string;
    /** The list of options available in the dropdown. */
    options: string[];
    /** The index of the currently selected option (optional). */
    valueIndex?: number;
    /** The value of the currently selected option (optional). */
    value?: string;
}

/**
 * Represents a slider widget used in settings.
 */
export interface SliderWidget {
    /** The label displayed for the slider. */
    label: string;
    /** The minimum value of the slider. */
    min: number;
    /** The maximum value of the slider. */
    max: number;
    /** The step value for the slider. */
    step: number;
    /** The current value of the slider (optional). */
    value?: number;
}

/**
 * Represents a toggle widget used in settings.
 */
export interface ToggleWidget {
    /** The label displayed for the toggle. */
    label: string;
    /** The current state of the toggle (true for on, false for off, optional). */
    value?: boolean;
}

/**
 * Represents a generic settings widget, which can be one of several widget types.
 */
export type SettingsWidget = TextFieldWidget | DropdownWidget | SliderWidget | ToggleWidget;

/**
 * Represents a category of settings, containing multiple widgets.
 */
export interface SettingsCatagory {
    /** The title of the settings category. */
    title: string;
    /** The list of settings widgets within the category. */
    settings: SettingsWidget[];
    /** The optional path to an icon representing the category. */
    iconPath?: string;
}

/**
 * Represents data for an extension.
 */
export interface ExtensionData {
    /** The unique identifier for the extension. */
    id: string;
    /** The optional path to an icon representing the extension. */
    iconPath?: string;
}

/**
 * Represents data for an addon, including metadata and settings.
 */
export interface AddonData {
    /** The format version of the addon data. */
    formatVersion: string;
    /** Metadata describing the addon. */
    description: {
        /** The version of the addon. */
        version: string;
        /** The author of the addon. */
        author: string;
        /** The unique pack ID of the addon. */
        packId: string;
        /** Optional list of dependencies for the addon. */
        dependencies?: string[];
    };
    /** The optional path to an icon representing the addon. */
    iconPath?: string;
    /** Optional guide keys for the addon. */
    guideKeys?: string[];
    /** Optional list of extensions associated with the addon. */
    extensions?: ExtensionData[];
    /** Optional settings for the addon, which can be widgets or categories. */
    settings?: SettingsWidget[] | SettingsCatagory[];
}

export enum AcmIcon {
    Acm = "textures/vxl/acm/icons/acm_icon",
    Exclaim = "textures/vxl/acm/icons/exclaim",
    Logs = "textures/vxl/acm/icons/logs",
    Missing = "textures/vxl/acm/icons/missing",
    Question = "textures/vxl/acm/icons/question",
    Return = "textures/vxl/acm/icons/return",
    Settings = "textures/vxl/acm/icons/settings",
    Uninstall = "textures/vxl/acm/icons/uninstall"
}

class AcmLibrary {
    public readonly Events: Events = Events.create();
    public readonly Fs: FsSys = FsSys.create();
    public addonData: AddonData | undefined = undefined;
    private responseAdress: string | undefined = undefined;
    private hasExtensions: boolean = false;
    private constructor() {
        system.afterEvents.scriptEventReceive.subscribe((event: ScriptEventCommandMessageAfterEvent) => this.extensionListener(event));

    }

    private onWorldReady(): void {
        if (!this.addonData) throw Error("addon data is undefined.");
        system.sendScriptEvent('acm:addon_ready', JSON.stringify(this.addonData));
        OnAddonReadyEventSignal.emit(OnAddonReadyEvent.create(this.addonData));
    }

    private extensionListener(event: ScriptEventCommandMessageAfterEvent): void {
        if (event.id === `acm:engine_ready`) {
            this.onWorldReady(); return; //ACM:SIGNAL.ADDON_ID.EMITTER_ID

        } else if (event.id.startsWith('ACM:SIGNAL.')) {
            const [, a, e] = event.id.split('.');
            if (event.message === 'void') {
                OnCustomSignalEmittedEventSignal.emit({ addonId: a.toLowerCase(), emitterId: e.toLowerCase(), data: undefined });
            } else {
                OnCustomSignalEmittedEventSignal.emit({ addonId: a.toLowerCase(), emitterId: e.toLowerCase(), data: JSON.parse(event.message) });
            }

        } else {
            if (!this.addonData) throw Error("addon data is undefined.");
            if (!this.hasExtensions || !event.message || !this.responseAdress || event.id !== `acm:ext_${this.responseAdress}` || !this.addonData.extensions) return;
            const data = JSON.parse(event.message) as { playerId: string, extensionId: string };
            if (!this.addonData.extensions.some(extension => extension.id.includes(data.extensionId))) return;
            const player = world.getEntity(data.playerId) as Player | undefined;
            if (!player) return;
            OnExtensionTriggerdEventSignal.emit({ extensionId: data.extensionId, player: player });
        }
    }

    private identifier(): string {
        return `${this.addonData?.description.author}_${this.addonData?.description.packId}`;
    }

    private isSettingsCatagory(settings: SettingsWidget[] | SettingsCatagory[]): boolean {
        return settings.length > 0 && 'title' in settings[0];
    }

    private getSettingsDatabase(categoryTitle?: string): ScoreboardObjective | undefined {
        const identifier = this.identifier().toUpperCase();
        const objectiveName = categoryTitle
            ? `ACM:${identifier}_${categoryTitle.toUpperCase()}`
            : `ACM:${identifier}`;
        return world.scoreboard.getObjective(objectiveName);
    }

    private getRawSettingsData(db: ScoreboardObjective): ScoreboardIdentity | undefined {
        return db.getParticipants().find(participant => db.getScore(participant) === 0);
    }

    private parseSettingsArray(rawSettingsData: ScoreboardIdentity): SettingsWidget[] {
        return JSON.parse(rawSettingsData.displayName) as SettingsWidget[];
    }

    private processSetting(setting: SettingsWidget): any {
        if ('options' in setting && setting.valueIndex !== undefined) {
            setting.value = setting.options[setting.valueIndex] || undefined;
        }
        return setting.value !== undefined ? setting.value : undefined;
    }

    private processCategorySettings(category: SettingsCatagory): { [key: string]: any } {
        const db = this.getSettingsDatabase(category.title);
        if (!db) return {};

        const rawSettingsData = this.getRawSettingsData(db);
        if (!rawSettingsData) return {};

        const settingsArray = this.parseSettingsArray(rawSettingsData);
        const categoryObject: { [key: string]: any } = {};

        settingsArray.forEach(setting => {
            categoryObject[setting.label] = this.processSetting(setting);
        });

        return categoryObject;
    }

    private processFlatSettings(): { [key: string]: any } {
        const db = this.getSettingsDatabase();
        if (!db) return {};

        const rawSettingsData = this.getRawSettingsData(db);
        if (!rawSettingsData) return {};

        const settingsArray = this.parseSettingsArray(rawSettingsData);
        const settingsObject: { [key: string]: any } = {};

        settingsArray.forEach(setting => {
            settingsObject[setting.label] = this.processSetting(setting);
        });

        return settingsObject;
    }

    public static create(): AcmLibrary {
        return new AcmLibrary();
    }

    /**
    * Initializes the addon with the provided data.
    * 
    * @param addonData - The data associated with the addon, including metadata and settings.
    * @throws Error if the addon is already initialized.
    */
    public initAddon(addonData: AddonData): void {
        if (this.addonData) throw Error("Addon already initialized");
        this.addonData = addonData;
        this.responseAdress = this.identifier();
        if (addonData.extensions) this.hasExtensions = true;
    }

    /**
    * Logs a message to ACM's interal logger.
    * 
    * @param message - The message to log.
    * @throws Error if the log database (scoreboard objective) is not found.
    */
    public log(message: string): void {
        const db: ScoreboardObjective | undefined = world.scoreboard.getObjective('ACM:LOG');
        if (!db) throw Error("Log database not found");
        const entry: number = db.getParticipants().length + 1;
        db.setScore(`${entry}: ${message}`, entry);
    }

    /**
    * Displays the ACM home (HUD) to the specified player.
    * 
    * @param player - The player to whom the home form will be displayed.
    */
    public showHomeForm(player: Player): void {
        system.sendScriptEvent('acm:hud_home', player.id);
    }

    /**
    * Displays your addon's page in the ACM (HUD) to the specified player.
    * 
    * @param player - The player to whom the addon form will be displayed.
    */
    public showAddonForm(player: Player): void {
        system.sendScriptEvent('acm:hud_addon', `${JSON.stringify({ playerId: player.id, addonData: this.addonData, })}`);
    }

    /**
    * Loads the settings data for your addon.
    * 
    * @returns An object containing the settings data, organized by category or as a flat structure.
    */
    public loadSettingsData(): { [key: string]: any } {
        if (!this.addonData) return {};

        const isCategory = this.isSettingsCatagory(this.addonData.settings as SettingsWidget[] | SettingsCatagory[]);
        const settingsObject: { [key: string]: any } = {};

        if (isCategory) {
            (this.addonData.settings as SettingsCatagory[]).forEach(category => {
                settingsObject[category.title] = this.processCategorySettings(category);
            });
        } else {
            Object.assign(settingsObject, this.processFlatSettings());
        }

        return settingsObject;
    }

    /**
    * Emits a custom event to OnCustomSignalEmittedEvent subscribers.
    * 
    * @param eventId - The unique identifier for the event.
    * @param data - Optional data to include with the event.
    */
    public emit(eventId: string, data?: any): void {
        const eventKey: string = `acm:signal.${this.addonData?.description.author}_${this.addonData?.description.packId}.${eventId}`
        let dataKey: any = 'void';
        if (data) dataKey = JSON.stringify(data);
        system.sendScriptEvent(eventKey.toLocaleUpperCase(), dataKey);
    }
}


class Events {
    private constructor() {
        this.OnAddonReady = OnAddonReadyEventSignal.create();
        this.OnSettingsChanged = OnSettingsChangedEventSignal.create();
        this.OnExtensionTriggerd = OnExtensionTriggerdEventSignal.create();
        this.OnCustomSignalEmitted = OnCustomSignalEmittedEventSignal.create();

    }
    readonly OnAddonReady: OnAddonReadyEventSignal;
    readonly OnSettingsChanged: OnSettingsChangedEventSignal;
    readonly OnExtensionTriggerd: OnExtensionTriggerdEventSignal;
    readonly OnCustomSignalEmitted: OnCustomSignalEmittedEventSignal;

    static create(): Events {
        return new Events();
    }
}

export class OnAddonReadyEvent {
    /**
     * Represents the event triggered when your addon is ready.
     * @param addonData The data associated with the addon.
     */
    private constructor(public readonly addonData: AddonData) { }

    /**
     * Creates a new instance of the `OnAddonReadyEvent`.
     * @param addonData The data associated with the addon.
     * @returns A new `OnAddonReadyEvent` instance.
     */
    static create(addonData: AddonData): OnAddonReadyEvent {
        return new OnAddonReadyEvent(addonData);
    }
}

/**
 * Represents an event that is triggered when a custom signal is emitted.
 */
/**
 * Represents an event triggered when a custom signal is emitted.
 */
export class OnCustomSignalEmittedEvent {
    /**
     * Constructs an instance of `OnCustomSignalEmittedEvent`.
     * This constructor is private to enforce the use of the `create` method for instantiation.
     * 
     * @param addonId - The unique identifier of the addon emitting the signal.
     * @param emitterId - The unique identifier of the emitter within the addon.
     * @param data - Optional additional data associated with the emitted signal.
     */
    private constructor(public readonly addonId: string, public readonly emitterId: string, public readonly data?: any) { }

    /**
     * Factory method to create an instance of `OnCustomSignalEmittedEvent`.
     * 
     * @param addonId - The unique identifier of the addon emitting the signal.
     * @param emitterId - The unique identifier of the emitter within the addon.
     * @param data - Optional additional data associated with the emitted signal.
     * @returns A new instance of `OnCustomSignalEmittedEvent`.
     */
    static create(addonId: string, emitterId: string, data?: any): OnCustomSignalEmittedEvent {
        return new OnCustomSignalEmittedEvent(addonId, emitterId, data);
    }
}

export class OnSettingsChangedEvent {
    /**
     * Represents the event triggered when addon settings are changed.
     * @param settingsData The updated settings data.
     * @param player The player who triggered the settings change (optional).
     */
    private constructor(public readonly settingsData: any, public readonly player?: Player) { }

    /**
     * Creates a new instance of the `OnSettingsChangedEvent`.
     * @param settingsData The updated settings data.
     * @param player The player who triggered the settings change (optional).
     * @returns A new `OnSettingsChangedEvent` instance.
     */
    static create(settingsData: any, player?: Player): OnSettingsChangedEvent {
        return new OnSettingsChangedEvent(settingsData, player);
    }
}

export class OnExtensionTriggerdEvent {
    /**
     * Represents the event triggered when an extension is activated.
     * @param extensionId The unique identifier of the triggered extension.
     * @param player The player who triggered the extension.
     */
    private constructor(public readonly extensionId: string, public readonly player: Player) { }

    /**
     * Creates a new instance of the `OnExtensionTriggerdEvent`.
     * @param extensionId The unique identifier of the triggered extension.
     * @param player The player who triggered the extension.
     * @returns A new `OnExtensionTriggerdEvent` instance.
     */
    static create(extensionId: string, player: Player): OnExtensionTriggerdEvent {
        return new OnExtensionTriggerdEvent(extensionId, player);
    }
}

class OnAddonReadyEventSignal {
    private static subscribers: Set<(arg: OnAddonReadyEvent) => void> = new Set();

    private constructor() { }

    static create(): OnAddonReadyEventSignal {
        return new OnAddonReadyEventSignal();
    }

    public subscribe(callback: (arg: OnAddonReadyEvent) => void): (arg: OnAddonReadyEvent) => void {
        OnAddonReadyEventSignal.subscribers.add(callback);
        return callback;
    }

    public unsubscribe(callback: (arg: OnAddonReadyEvent) => void): void {
        OnAddonReadyEventSignal.subscribers.delete(callback);
    }

    public static emit(event: OnAddonReadyEvent): void {
        for (const callback of this.subscribers) {
            try {
                callback(event);
            } catch (error) {
                console.error("Error @ACM:OnAddonReadyEvent global subscriber:", error);
            }
        }
    }
}

class OnCustomSignalEmittedEventSignal {
    private static subscribers: Set<(arg: OnCustomSignalEmittedEvent) => void> = new Set();

    private constructor() { }

    static create(): OnCustomSignalEmittedEventSignal {
        return new OnCustomSignalEmittedEventSignal();
    }

    public subscribe(callback: (arg: OnCustomSignalEmittedEvent) => void): (arg: OnCustomSignalEmittedEvent) => void {
        OnCustomSignalEmittedEventSignal.subscribers.add(callback);
        return callback;
    }

    public unsubscribe(callback: (arg: OnCustomSignalEmittedEvent) => void): void {
        OnCustomSignalEmittedEventSignal.subscribers.delete(callback);
    }

    public static emit(event: OnCustomSignalEmittedEvent): void {
        for (const callback of this.subscribers) {
            try {
                callback(event);
            } catch (error) {
                console.error("Error @ACM:OnCustomSignalEmittedEvent global subscriber:", error);
            }
        }
    }
}

class OnSettingsChangedEventSignal {
    private static subscribers: Set<(arg: OnSettingsChangedEvent) => void> = new Set();

    private constructor() { }

    static create(): OnSettingsChangedEventSignal {
        return new OnSettingsChangedEventSignal();
    }

    public subscribe(callback: (arg: OnSettingsChangedEvent) => void): (arg: OnSettingsChangedEvent) => void {
        OnSettingsChangedEventSignal.subscribers.add(callback);
        return callback;
    }

    public unsubscribe(callback: (arg: OnSettingsChangedEvent) => void): void {
        OnSettingsChangedEventSignal.subscribers.delete(callback);
    }

    public static emit(event: OnSettingsChangedEvent): void {
        for (const callback of this.subscribers) {
            try {
                callback(event);
            } catch (error) {
                console.error("Error @ACM:OnSettingsChangedEvent global subscriber:", error);
            }
        }
    }
}

class OnExtensionTriggerdEventSignal {
    private static subscribers: Set<(arg: OnExtensionTriggerdEvent) => void> = new Set();

    private constructor() { }

    static create(): OnExtensionTriggerdEventSignal {
        return new OnExtensionTriggerdEventSignal();
    }

    public subscribe(callback: (arg: OnExtensionTriggerdEvent) => void): (arg: OnExtensionTriggerdEvent) => void {
        OnExtensionTriggerdEventSignal.subscribers.add(callback);
        return callback;
    }

    public unsubscribe(callback: (arg: OnExtensionTriggerdEvent) => void): void {
        OnExtensionTriggerdEventSignal.subscribers.delete(callback);
    }

    public static emit(event: OnExtensionTriggerdEvent): void {
        for (const callback of this.subscribers) {
            try {
                callback(event);
            } catch (error) {
                console.error("Error @ACM:OnExtensionTriggerdEvent global subscriber:", error);
            }
        }
    }
}

// Fs

const ROOT_DIR = `ACM:FS`;

export class FsSys {
    private static _sb: Scoreboard = world.scoreboard;
    private static getLocalId(): string {
        const addonData: AddonData | undefined = AcmLib.addonData;
        if (!addonData) throw new Error('Addon data not found');
        return `${addonData.description.author}_${addonData.description.packId}`;

    }
    private static _format: (name: string) => string = ((name: string): string => { return `${ROOT_DIR}.${FsSys.getLocalId().toUpperCase()}.${name.toUpperCase()}` });
    private constructor(public readonly Dir: FsDir = FsDir.create(FsSys._sb, FsSys._format)) { }
    /**
     * Creates a new instance of the `FsSys` class.
     * Provides access to the directory system for managing scoreboard-based data.
     */
    public static create(): FsSys { return new FsSys(); }
}

export class Directory {
    /**
     * The unique identifier for the directory (scoreboard objective).
     */
    public readonly dbId: string;
    private readonly localId: string = (() => {
        const addonData: AddonData | undefined = AcmLib.addonData;
        if (!addonData) throw new Error('Addon data not found');
        const localId: string = `${addonData.description.author}_${addonData.description.packId}`
        return localId.toUpperCase();

    })();

    private constructor(private readonly objective: ScoreboardObjective) {
        this.dbId = objective.displayName;
    }

    private getKeyIdentity(fileName: string): ScoreboardIdentity | undefined {
        const participants = this.objective.getParticipants();
        return participants.find((p: ScoreboardIdentity) => p.displayName.startsWith(`${fileName}:`));
    }

    private getKeyData(fileName: string, identity: ScoreboardIdentity): any {
        return JSON.parse(identity.displayName.replace(`${fileName}:`, ''));
    }

    private isOwner(): boolean {
        const localId: string = this.localId;
        if (!this.dbId.includes(localId)) throw new Error(`Directory ${this.dbId} does not belong to addon: ${localId}`);
        return true;
    }

    /**
     * Checks if a file exists in the directory.
     * @param fileName The name of the file to check.
     * @returns True if the file exists, false otherwise.
     */
    public exists(fileName: string): boolean {
        return this.getKeyIdentity(fileName) !== undefined;
    }

    /**
     * Reads the content of a file in the directory.
     * @param fileName The name of the file to read.
     * @returns The content of the file.
     * @throws Error if the file does not exist.
     */
    public read(fileName: string): any {
        if (!this.exists(fileName)) throw new Error(`File ${fileName} does not exist`);
        const identity: ScoreboardIdentity | undefined = this.getKeyIdentity(fileName);
        if (!identity) throw new Error(`File ${fileName} does not exist`);
        return this.getKeyData(fileName, identity);
    }

    /**
     * Writes content to a file in the directory.
     * @param fileName The name of the file to write.
     * @param content The content to write to the file.
     * @param allowOverwrite Whether to allow overwriting an existing file (default: true).
     * @throws Error if the file already exists and overwriting is not allowed.
     */
    public async write(fileName: string, content: any, allowOverwrite: boolean = true): Promise<void> {
        const dataKey: string = `${fileName}:${JSON.stringify(content)}`;
        if (this.exists(fileName) && !allowOverwrite) throw new Error(`File ${fileName} already exists`);

        if (!this.isOwner()) return;

        const slotNumber: number = this.objective.getParticipants().length;
        this.objective.setScore(dataKey, slotNumber);
    }

    /**
     * Deletes a file from the directory.
     * @param fileName The name of the file to delete.
     * @throws Error if the file does not exist.
     */
    public delete(fileName: string): void {
        if (!this.exists(fileName)) throw new Error(`File ${fileName} does not exist`);

        if (!this.isOwner()) return;

        const identity: ScoreboardIdentity | undefined = this.getKeyIdentity(fileName);
        if (!identity) throw new Error(`File ${fileName} does not exist`);
        this.objective.removeParticipant(identity);
    }

    /**
     * Renames a file in the directory.
     * @param oldFileName The current name of the file.
     * @param newFileName The new name for the file.
     * @throws Error if the old file does not exist or the new file already exists.
     */
    public rename(oldFileName: string, newFileName: string): void {
        if (!this.exists(oldFileName)) throw new Error(`File ${oldFileName} does not exist`);
        if (this.exists(newFileName)) throw new Error(`File ${newFileName} already exists`);

        if (!this.isOwner()) return;

        const identity: ScoreboardIdentity | undefined = this.getKeyIdentity(oldFileName);
        if (!identity) throw new Error(`File ${oldFileName} does not exist`);
        const content = this.getKeyData(oldFileName, identity);
        this.delete(oldFileName);
        this.write(newFileName, content);
    }

    /**
     * Copies a file within the directory.
     * @param sourceFileName The name of the source file.
     * @param destinationFileName The name of the destination file.
     * @throws Error if the source file does not exist or the destination file already exists.
     */
    public copy(sourceFileName: string, destinationFileName: string): void {
        if (!this.exists(sourceFileName)) throw new Error(`Source file ${sourceFileName} does not exist`);
        if (this.exists(destinationFileName)) throw new Error(`Destination file ${destinationFileName} already exists`);

        if (!this.isOwner()) return;

        const identity: ScoreboardIdentity | undefined = this.getKeyIdentity(sourceFileName);
        if (!identity) throw new Error(`Source file ${sourceFileName} does not exist`);
        const content = this.getKeyData(sourceFileName, identity);
        this.write(destinationFileName, content);
    }

    /**
     * Moves a file within the directory.
     * @param sourceFileName The name of the source file.
     * @param destinationFileName The name of the destination file.
     * @throws Error if the source file does not exist or the destination file already exists.
     */
    public move(sourceFileName: string, destinationFileName: string): void {
        this.isOwner();

        this.copy(sourceFileName, destinationFileName);
        this.delete(sourceFileName);
    }

    /**
     * Gets the size of a specific file in bytes.
     * @param fileName The name of the file.
     * @returns The size of the file in bytes.
     * @throws Error if the file does not exist.
     */
    public fileSize(fileName: string): number {
        if (!this.exists(fileName)) throw new Error(`File ${fileName} does not exist`);
        const identity: ScoreboardIdentity | undefined = this.getKeyIdentity(fileName);
        if (!identity) throw new Error(`File ${fileName} does not exist`);
        const content = this.getKeyData(fileName, identity);
        return JSON.stringify(content).length;
    }

    /**
     * Gets the total size of the directory in bytes.
     * @returns The total size of the directory.
     */
    public size(): number {
        return this.objective.getParticipants().reduce((length, p) => length + p.displayName.length, 0);
    }

    /**
     * Lists all files in the directory.
     * @returns An array of file names in the directory.
     */
    public list(): string[] {
        return this.objective.getParticipants().map((p: ScoreboardIdentity) => {
            const [fileName] = p.displayName.split(':');
            return fileName;
        });
    }

    /**
     * Creates a new `Directory` instance for a given scoreboard objective.
     * @param objective The scoreboard objective representing the directory.
     * @returns A new `Directory` instance.
     */
    public static create(objective: ScoreboardObjective): Directory { return new Directory(objective); }

}


class FsDir {
    private constructor(private readonly Sb: Scoreboard, private readonly format: (name: string) => string) { }
    public static create(Sb: Scoreboard, format: (name: string) => string): FsDir { return new FsDir(Sb, format); }

    /**
     * Checks if a directory with the given name exists.
     * @param name The name of the directory.
     * @returns True if the directory exists, false otherwise.
     */
    public isValid(name: string): boolean {
        return this.Sb.getObjective(this.format(name)) !== undefined;
    }

    /**
     * Retrieves a directory by its name.
     * @param name The name of the directory.
     * @returns The `Directory` instance if found, or undefined if it does not exist.
     */
    public get(name: string): Directory | undefined {
        const db: ScoreboardObjective | undefined = this.Sb.getObjective(this.format(name));
        if (!db) return undefined;
        else return Directory.create(db);
    }

    /**
     * Creates a new directory with the given name.
     * @param name The name of the directory.
     * @param ignoreWarn Whether to suppress warnings if the directory already exists (default: false).
     * @returns The newly created or existing `Directory` instance.
     */
    public new(name: string, ignoreWarn: boolean = false): Directory {
        const formatedName: string = this.format(name);
        if (this.isValid(name)) {
            if (!ignoreWarn) console.warn(`Directory ${formatedName} already exists`);
            const db: Directory | undefined = this.get(name)
            if (db) return db;
        }
        const db: ScoreboardObjective = this.Sb.addObjective(formatedName);
        return Directory.create(db);
    }

    /**
     * Deletes a directory by its name.
     * @param name The name of the directory to delete.
     * @throws Error if the directory does not exist.
     */
    public delete(name: string): void {
        const db: Directory | undefined = this.get(name);
        if (!db) throw new Error(`Directory ${name} does not exist`);
        this.Sb.removeObjective(this.format(name));
    }
}

export const AcmLib: AcmLibrary = AcmLibrary.create();