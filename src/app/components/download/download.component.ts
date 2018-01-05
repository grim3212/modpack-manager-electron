import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal/bs-modal-ref.service';

@Component({
  selector: 'app-download',
  templateUrl: './download.component.html',
  styleUrls: ['./download.component.scss']
})
export class DownloadComponent {

  title: string;
  progress: number = 0;
  currentFile: { fileName: string, url: string, path: string } = {
    fileName: '',
    url: '',
    path: ''
  };

  completedFiles: number = 0;
  totalFiles: number = 0;

  constructor(private bsModalRef: BsModalRef, private change: ChangeDetectorRef) { }

  private checkChanges() {
    this.change.detectChanges();
  }

}
