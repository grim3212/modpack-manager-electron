import { Component, OnInit, TemplateRef } from '@angular/core';
import { ConfigService } from '../../providers/config.service';
import { ModPackService, ModPack } from '../../providers/modpack.service';
import { execFile } from 'child_process';
import { remote } from 'electron';
import { BsDropdownDirective } from 'ngx-bootstrap/dropdown';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BsModalRef } from 'ngx-bootstrap/modal/bs-modal-ref.service';

import * as p from 'path';
import * as fs from 'fs';
import * as readdirp from 'readdirp';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {

  private alerts: any = [];
  private modPacks: ModPack[] = [];
  private selectedPack: ModPack;

  private installModal: BsModalRef;
  private updateModal: BsModalRef;

  constructor(public config: ConfigService, public modpackService: ModPackService, public modalService: BsModalService) { }

  ngOnInit() {
    this.refreshListings();
  }

  private log(msg) {
    console.log(msg);
  }

  private rightClick(event, dropdown: BsDropdownDirective) {
    if (event.button == 2) {
      dropdown.show();
    }
  }

  private updatePack(pack: ModPack, modal: TemplateRef<any>) {
    this.selectedPack = pack;

    this.updateModal = this.modalService.show(modal);
  }

  private confirmUpdate(url) {
    console.log(`Confirmed pack update ${this.selectedPack.name} - ${url}`);
    this.updateModal.hide();

    this.modpackService.updatePack(this.selectedPack, url).then((modPack: ModPack) => {
      this.basicAlert(`Modpack update completed!`);
      this.refreshListings();
    }).catch((err) => {
      this.errorAlert(`Modpack update failed!\n${err}`);
    });
  }

  private declineUpdate() {
    console.log('Declined pack update');
    this.updateModal.hide();
  }

  private refreshListings(): void {
    this.modpackService.getModPacks().then((packs: ModPack[]) => {
      this.modPacks = packs;
    }).catch((err) => {
      console.error(err);
    });
  }

  private openInstall(modal: TemplateRef<any>) {
    this.installModal = this.modalService.show(modal);
  }

  private confirmInstall(name, url) {
    console.log(`Confirmed pack install ${name} - ${url}`);
    this.installModal.hide();

    this.packInstall(name, url);
  }

  private declineInstall() {
    console.log('Declined pack install');
    this.installModal.hide();
  }

  private errorAlert(msg: string): void {
    this.addAlert('danger', msg, 8000);
  }

  private basicAlert(msg: string): void {
    this.addAlert('info', msg, 5000);
  }

  private addAlert(type: string, msg: string, timeout: number): void {
    this.alerts.push({
      type: type,
      msg: msg,
      timeout: timeout
    });

    if (type === 'info' || type === 'success') {
      console.log(msg);
    } else if (type === 'danger') {
      console.error(msg);
    } else if (type === 'warning') {
      console.warn(msg);
    }
  }

  private chooseZipFile(input, curName?): void {
    remote.dialog.showOpenDialog({
      title: "Choose your modpack zip...",
      filters: [
        { name: 'Accepted File Types', extensions: ['zip'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: [
        'openFile'
      ]
    }, (files) => {
      if (files && files[0]) {
        input.value = files[0];

        if (curName && !curName.value) {
          //If the pack name isn't already set then use the filename as the pack name
          curName.value = p.basename(input.value, p.extname(input.value));
        }
      }
    });
  }

  private setInstanceFolder(): void {
    remote.dialog.showOpenDialog({
      title: "Choose a new instance folder...",
      defaultPath: this.config.instanceLocation.value,
      filters: [
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: [
        'openDirectory', 'createDirectory'
      ]
    }, (path) => {
      if (path && path[0]) {
        this.config.instanceLocation.setValue(path[0]);
        this.basicAlert(`Set instance location to '${path[0]}'`);
        this.refreshListings();
      } else {
        this.errorAlert('Path cannot be empty!!');
      }
    });
  }

  private packInstall(packName: string, fileUrl: string) {
    if (!packName) {
      this.errorAlert('Pack Name is required for pack install!!');
      return;
    }

    if (!fileUrl) {
      this.errorAlert('File path is required for pack install!!');
      return;
    }

    console.log(`Installing modpack ${packName}`);

    this.modpackService.constructModPack(packName, fileUrl).then((pack: ModPack) => {
      this.basicAlert(`Modpack has been successfully created!!\n${pack.mods.length} found`);
      this.refreshListings();
    }).catch((err) => {
      this.errorAlert(`Modpack creation failed!\n${err}`);
    });
  }
}
