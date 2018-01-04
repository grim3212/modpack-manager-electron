import { Injectable } from '@angular/core';
import { ConfigService } from './config.service';
import { ElectronService } from './electron.service';
import { remote } from 'electron';

const dlHelper = remote.require('electron-download-manager');
const zip = remote.require('adm-zip');

import * as async from 'async';
import * as fs from 'fs';
import * as p from 'path';

@Injectable()
export class ModPackService {

  constructor(private electronService: ElectronService, private config: ConfigService) { }

  public getModPacks(): Promise<ModPack[]> {
    return new Promise<ModPack[]>((resolve, reject) => {
      var packs: ModPack[] = [];
      var dirs = this.getDirectories(this.config.instanceLocation.value);

      dirs.forEach(dir => {
        const manifestLoc = p.join(dir, 'manifest.json');

        if (fs.existsSync(manifestLoc)) {
          //Manifest exists now check if it has our modpackManager property
          fs.readFile(manifestLoc, 'utf8', (err, data) => {
            var json = JSON.parse(data);

            if (json['modpackManager']) {
              //If it has our property then add it to our list of modpacks
              packs.push(ModPack.fromJSON(dir, json));
            } else {
              //Folder wasn't generated with modpack manager
              return;
            }
          });
        }
      });

      return resolve(packs);
    });
  }

  public updatePack(modPack: ModPack, url: string): Promise<ModPack> {
    return new Promise<ModPack>((resolve, reject) => {
      this.getZipFromUrl(url).then((path) => {
        console.log(`Updating with pack found at ${path}`);

        var updatePack = new ModPack();
        updatePack.origin = url;
        updatePack.sourceLocation = path;
        updatePack.folderPath = modPack.folderPath;
        updatePack.name = modPack.name;

        //Grab new manifest
        var packZip = new zip(updatePack.sourceLocation);
        var manifest = this.getManifest(packZip);

        //Process a new mod pack for the update pack
        this.processModPack(updatePack, manifest).then((pack) => {
          //Remove the old mods that are no longer needed
          this.removeOldMods(modPack, pack).then(() => {

            //Check if we need to delete override files
            this.deleteOverrideFiles(modPack).then(() => {

              //Try to copy overrides
              this.copyOverrides(packZip, pack);

              //Check if the cfg needs to be remade
              this.setupMMC(pack);

              //Update the manifest with the new values from the new manifest
              //This should only evaluate true if an error was found
              const manifestErr = this.writeManifest(pack, manifest);

              if (manifestErr) {
                return reject(manifestErr);
              }

              return resolve(pack);

            }).catch((err) => {
              return reject(err);
            });
          }).catch((err) => {
            return reject(err);
          });
        }).catch((err) => {
          return reject(err);
        });
      }).catch((err) => {
        return reject(err);
      });
    });
  }

  public removeOldMods(oldModPack: ModPack, newModPack: ModPack): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      var removed = 0;

      console.log('Removing mods...');

      async.eachLimit(newModPack.mods, newModPack.mods.length, (mod, callback) => {

        //Compare new mods to old mods and remove the same ones
        if (oldModPack.modContained(mod.projectID)) {
          const oldMod = oldModPack.getMod(mod.projectID);

          //If they aren't the same file then remove the old one
          //Make sure the old mod succeeded
          if (oldMod.success && mod.fileID !== oldMod.fileID) {
            const modPath = p.join(p.join(newModPack.folderPath, '/minecraft/mods'), oldMod.fileName);

            fs.exists(modPath, (exists) => {
              if (exists) {
                fs.unlink(modPath, (err) => {
                  if (err) {
                    callback(`Failed to unlink file at ${modPath}!`);
                  } else {
                    removed += 1;
                    callback();
                  }
                });
              } else {
                console.log(`Can't find '${oldMod.fileName}' in mods directory.`);
                callback();
              }
            });
          } else {
            //Old mod wasn't a success
            callback();
          }
        } else {
          //Old mod doesn't contain the new mod
          callback();
        }

      }, (err) => {

        //Wait for loop to finish reading
        if (err) {
          return reject(err);
        } else {
          async.eachLimit(oldModPack.mods, oldModPack.mods.length, (oldMod, callback) => {

            //Compare new mods to old mods and remove missing ones
            if (!newModPack.modContained(oldMod.projectID)) {
              const modPath = p.join(p.join(newModPack.folderPath, '/minecraft/mods'), oldMod.fileName);

              //Check if the mod still exists and if so delete it
              fs.exists(modPath, (exists) => {
                if (exists) {
                  fs.unlink(modPath, (err) => {
                    if (err) {
                      callback(`Failed to unlink file at ${modPath}!`);
                    } else {
                      removed += 1;
                      callback();
                    }
                  });
                } else {
                  console.log(`Can't find '${oldMod.fileName}' in mods directory.`);
                  callback();
                }
              });
            } else {
              //Old mod doesn't contain the new mod
              callback();
            }

          }, (err) => {

            //Wait for loop to finish reading
            if (err) {
              return reject(err);
            } else {
              console.log(`Removed ${removed} old mods!`);
              return resolve();
            }
          });
        }
      });
    });
  }

  private getDirectories(source: string): string[] {
    const isDirectory = source => fs.lstatSync(source).isDirectory();
    return fs.readdirSync(source).map(name => p.join(source, name)).filter(isDirectory);;
  }

  private getZipFromUrl(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      //Check if zip for local file
      if (url.endsWith('.zip')) {
        return resolve(url);
      }
      //Else check if it's either curseforge or feed-the-beast
      else if (url.startsWith('https://minecraft.curseforge.com/projects/') || url.startsWith('https://www.feed-the-beast.com')) {
        //Download the zip so we can work with it
        dlHelper.download({ url: this.fixUrl(url), path: remote.app.getPath('temp') }, (err, dlItem) => {
          if (err) {
            return reject(`Failed to download modpack at '${url}'`);
          } else {
            return resolve(dlItem.path);
          }
        });
      } else {
        //If it doesn't satisfy any of the above requirements than construction failed
        return reject(`The file url must be a zip file or be from CurseForge or feed-the-beast. '${url}' was passed in!`);
      }
    });
  }

  private fixUrl(url: string): string {
    if (url.endsWith('download')) {
      return url;
    } else {
      return url + "/download";
    }
  }

  public constructModPack(packName: string, fileUrl: string): Promise<ModPack> {
    return new Promise<ModPack>((resolve, reject) => {

      var folderPath = p.join(this.config.instanceLocation.value, packName);

      var modPack = new ModPack();
      modPack.name = packName;
      modPack.origin = fileUrl;
      modPack.folderPath = folderPath;

      this.getZipFromUrl(fileUrl).then((path) => {
        //Setup the location of the zip
        modPack.sourceLocation = path;

        //Get zip file and manifest
        var packZip = new zip(modPack.sourceLocation);
        var manifest = this.getManifest(packZip);

        //Start to process the zip
        this.processModPack(modPack, manifest).then((modpack: ModPack) => {

          //Try to copy overrides
          this.copyOverrides(packZip, modPack);

          //Try to grab forge version
          //This is only needed if we are not installing as a MMC instance
          //this.installForge(modPack);

          //Try to setup multi mc instance
          this.setupMMC(modPack);

          //This should only evaluate true if an error was found
          const manifestErr = this.writeManifest(modPack, manifest);

          if (manifestErr) {
            return reject(manifestErr);
          }

          return resolve(modpack);
        }).catch((err) => {
          return reject(err);
        });
      }).catch((err) => {
        return reject(err);
      });
    });
  }

  private addModPackProperties(modPack: ModPack, manifest): any {
    if (manifest) {

      if (manifest.minecraft.modLoaders.length < 1) {
        return `Forge version could not be found!`;
      }

      if (!manifest.minecraft.version) {
        return `Minecraft version could not be found!`;
      }

      modPack.mcVersion = manifest.minecraft.version;
      modPack.forgeVersion = manifest.minecraft.modLoaders[0].id.replace('forge-', '');

      modPack.projectID = manifest.projectID;
      modPack.manifestName = manifest.name ? manifest.name : '';
      modPack.author = manifest.author ? manifest.author : '';
      modPack.version = manifest.version ? manifest.version : '';
      modPack.overrides = manifest.overrides ? manifest.overrides : '';
      modPack.mods = [];

    } else {
      return 'Passed in an empty manifest!';
    }
  }

  public processModPack(modPack: ModPack, manifest): Promise<ModPack> {
    return new Promise<ModPack>((resolve, reject) => {

      //Manifest was found
      if (manifest) {

        //Add properties to modpack
        var propErr = this.addModPackProperties(modPack, manifest);

        if (propErr) {
          //An error has occurred while adding properties
          return reject(propErr);
        }

        //Try and iterate through the manifest
        console.log(`Modpack contains ${manifest.files.length} mods \nUsing Minecraft ${modPack.mcVersion} and Forge ${modPack.forgeVersion}`);

        var dls = {
          downloads: [
          ],
          path: p.join(modPack.folderPath, '/minecraft/mods')
        }

        manifest.files.forEach(file => {
          var curMod = new Mod();
          var url = `https://minecraft.curseforge.com/projects/${file.projectID}/files/${file.fileID}/download`;

          //Setup mod with data we can get from the manifest
          curMod.required = file.required;
          curMod.projectID = file.projectID;
          curMod.fileID = file.fileID;
          curMod.url = url;

          //Add each mod from the manifest to an object to be bulk downloaded
          dls.downloads.push({
            url: url,
            callback: (error, dlItem) => {
              //When each mod finishes downloading
              if (error) {
                //Add the failed mod to the modpack
                curMod.success = false;
                modPack.mods.push(curMod);

                console.log("ERROR: " + curMod.projectID + ' failed to download at ' + dlItem.url);
                console.log(error);
                return;
              }
              console.log("DONE: " + dlItem.url);

              //Finish setting up the mod
              curMod.success = true;
              curMod.fileName = dlItem.filename;
              curMod.size = dlItem.size;

              //Add the mod to the modpack
              modPack.mods.push(curMod);
            }
          });
        });

        dlHelper.bulkDownload(dls, (error, finished, errors) => {
          console.log('Mod downloads complete');
          
          if (error) {
            console.log(`${errors.length} mods were unable to download.`);
          }

          return resolve(modPack);
        });
      } else {
        return reject(`ModPack didn't contain a 'manifest.json'!`);
      }
    });
  }

  public copyOverrides(packZip, modPack: ModPack): void {
    //Grab the entries
    var zipEntries = packZip.getEntries();

    var overrideName = modPack.overrides + "/";
    var overrides: string[] = [];
    modPack.overrideFiles = [];

    //Check if overrides name exists
    zipEntries.forEach((zipEntry) => {
      if (zipEntry.entryName === overrideName) {
        packZip.extractEntryTo(zipEntry.entryName, p.join(modPack.folderPath, 'minecraft/'), false, true);
      }

      if (zipEntry.entryName.startsWith(overrideName)) {
        //Add a list of overrides
        overrides.push(zipEntry.entryName.replace(overrideName, ''));
      }
    });

    const isFile = source => fs.lstatSync(source).isFile();

    //Add every file from the overrides folder to a list that will be stored in the manifest
    //This will be used to delete all of these files during an update
    overrides.forEach((override) => {
      const overridePath = p.join(p.join(modPack.folderPath, 'minecraft/'), override);

      if (isFile(overridePath)) {
        //console.log(`Adding ${overridePath} to manifest list of override files!`);
        modPack.overrideFiles.push('minecraft/' + override);
      }
    });
  }

  public deleteOverrideFiles(modPack: ModPack): Promise<any> {
    return new Promise<any>((resolve, reject) => {
      if (this.config.removeOverridesOnUpdate.value) {
        console.log('Removing old override files...');
        if (modPack.overrideFiles) {
          var removed = 0;

          async.each(modPack.overrideFiles, (file, callback) => {

            const fullPath = p.join(modPack.folderPath, file);

            //Check if the override exists and if so then delete it
            fs.exists(fullPath, (exists) => {
              if (exists) {
                fs.unlink(fullPath, (err) => {
                  if (err) {
                    callback(`Failed to unlink file at ${fullPath}!`);
                  } else {
                    removed += 1;
                    callback();
                  }
                });
              } else {
                console.log(`Can't find '${fullPath}' in minecraft directory.`);
                callback();
              }
            });

          }, (err) => {

            if (err) {
              return reject(err);
            } else {
              console.log(`Removed ${removed} override files!`);
              return resolve();
            }

          });
        } else {
          console.log('No override files to delete!');
          return resolve();
        }
      } else {
        return resolve();
      }
    });
  }

  public installForge(modPack: ModPack): void {
  }

  public setupMMC(modPack: ModPack): any {
    const cfgPath = p.join(modPack.folderPath, 'instance.cfg');

    if (!fs.existsSync(cfgPath)) {
      var instanceLines = `InstanceType=OneSix\n`;
      instanceLines += `IntendedVersion=${modPack.mcVersion}\n`;
      instanceLines += `ForgeVersion=${modPack.forgeVersion}\n`;
      instanceLines += `LogPrePostOutput=true\n`;
      instanceLines += `OverrideCommands=false\n`;
      instanceLines += `OverrideConsole=false\n`;
      instanceLines += `OverrideJavaArgs=false\n`;
      instanceLines += `OverrideJavaLocation=false\n`;
      instanceLines += `OverrideMemory=false\n`;
      instanceLines += `OverrideWindow=false\n`;
      instanceLines += `iconKey=default\n`;
      instanceLines += `lastLaunchTime=0\n`;
      instanceLines += `name=${modPack.name}\n`;
      instanceLines += `totalTimePlayed=0`;

      fs.writeFile(cfgPath, instanceLines, (err) => {
        if (err) {
          console.log("Error while creating MultiMC instance.cfg!");
          return console.error(err);
        }

        console.log("MultiMC instance.cfg created successfully!");
      });
    } else {
      console.log("MultiMC instance.cfg already exists!")
    }
  }

  public writeManifest(modPack: ModPack, manifest): any {
    //First add some extra data to the original manifest

    //Used to make sure that this pack was created with this program
    //That way we can handle easier updating
    manifest['modpackManager'] = true;
    manifest['sourceLocation'] = modPack.sourceLocation;
    manifest['origin'] = modPack.origin;
    manifest['overrideFiles'] = modPack.overrideFiles;

    //Add some extra properties to each of the files in the manifest
    manifest.files.forEach((file) => {
      var matchingMod = modPack.getMod(file.projectID);

      if (matchingMod) {
        matchingMod.addExtras(file);
      } else {
        return `Manifest and ModPack are not the same! Missing mod with project ID '${file.projectID}'`;
      }
    });

    var json = JSON.stringify(manifest, null, 2);

    //Write the json to file
    fs.writeFile(p.join(modPack.folderPath, 'manifest.json'), json, (err) => {
      if (err) {
        console.log("Error while creating manifest.json!");
        return console.error(err);
      }

      console.log("manifest.json created successfully!");
    });
  }

  public getManifest(packZip): any {
    //Try and grab the manifest.json
    var manifest = packZip.readAsText('manifest.json');

    if (manifest) {
      console.log('Manifest was found');
      return JSON.parse(manifest);
    } else {
      //Manifest wasn't found or empty
      return false;
    }
  }
}

export class ModPack {
  public origin: string;
  public sourceLocation: string;
  public folderPath: string;

  public name: string;
  public manifestName: string;
  public author: string;
  public version: string;
  public mcVersion: string;
  public forgeVersion: string;
  public projectID: number;
  public overrides: string;
  public overrideFiles: string[];

  //Should never be any duplicate project ids
  public mods: Mod[];

  public modContained(projectID: number): boolean {
    for (let mod of this.mods) {
      if (mod.projectID === projectID)
        return true;
    }

    return false;
  }

  public getMod(projectID: number): Mod {
    for (let mod of this.mods) {
      if (mod.projectID === projectID)
        return mod;
    }

    console.log(`Mod with project ID '${projectID}' can't be found!`);
    return null;
  }

  //Returns a new modpack object from a manifest json
  public static fromJSON(path: string, json): ModPack {
    var modPack = new ModPack();
    modPack.folderPath = path;
    modPack.name = p.basename(path);
    modPack.origin = json['origin'];
    modPack.sourceLocation = json['sourceLocation'];
    modPack.overrideFiles = json['overrideFiles'];

    modPack.manifestName = json.name;
    modPack.author = json.author;
    modPack.version = json.version;

    modPack.mcVersion = json.minecraft.version;

    //Check if forge version is specified
    if (json.minecraft.modLoaders[0])
      modPack.forgeVersion = json.minecraft.modLoaders[0].id.replace('forge-', '');

    modPack.projectID = json.projectID;

    modPack.mods = [];

    json.files.forEach(file => {
      var mod = new Mod();
      mod.fileID = file.fileID;
      mod.projectID = file.projectID;
      mod.required = file.required;
      mod.success = file.success;
      mod.fileName = file.fileName;
      mod.url = file.url;

      modPack.mods.push(mod);
    });

    return modPack;
  }
}

export class Mod {
  public projectID: number;
  public fileID: number;
  public required: boolean;
  public success: boolean;
  public fileName: string;
  public url: string;
  public size: number;

  public addExtras(file) {
    file['success'] = this.success;
    file['fileName'] = this.fileName;
    file['url'] = this.url;
  }
}
