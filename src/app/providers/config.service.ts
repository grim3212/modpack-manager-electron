import { Injectable } from '@angular/core';
import { remote } from 'electron';

import * as p from 'path';
var settings = remote.require('electron-settings');

@Injectable()
export class ConfigService {

  //All available config options
  public checkForUpdatesOnStart: ConfigOption<boolean>;
  public instanceLocation: ConfigOption<string>;
  public ignoreFailedDownloads: ConfigOption<boolean>;
  public removeOverridesOnUpdate: ConfigOption<boolean>;

  constructor() {
    //First load our configuration
    this.setupConfig();
  }

  private setupConfig(): void {
    this.checkForUpdatesOnStart = new ConfigOption<boolean>('config.checkForUpdatesOnStart', true);
    this.ignoreFailedDownloads = new ConfigOption<boolean>('config.ignoreFailedDownloads', true);
    this.instanceLocation = new ConfigOption<string>('config.instanceLocation', p.join(remote.app.getPath('downloads'), '/instances/'));
    this.removeOverridesOnUpdate = new ConfigOption<boolean>('config.removeOverridesOnUpdate', true);
  }
}

class ConfigOption<T> {
  private name: string;
  public value: T;
  private defaultValue: T;

  constructor(name: string, defaultValue: T) {
    this.name = name;
    this.defaultValue = defaultValue;

    //Setup current value
    this.setupValue();
  }

  /**
   * Check if an option exists and if not create and set it with the default value
   */
  private setupValue(): void {
    //Create setting with default value if the option name can't be found
    if (!settings.has(this.name)) {
      settings.set(this.name, this.defaultValue);
      this.value = this.defaultValue;
    } else {
      this.value = settings.get(this.name);
    }
  }

  /**
   * Try to set a new value for this option
   * 
   */
  public setValue(newVal: T): void {
    //Create setting with default value if the option name can't be found
    //Although it should almost always exist
    if (!settings.has(this.name)) {
      console.error(`Can't find config for ${this.name}`);
    } else {
      settings.set(this.name, newVal);
      this.value = newVal;
    }
  }
}
