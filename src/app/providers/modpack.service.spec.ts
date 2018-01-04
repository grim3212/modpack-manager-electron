import { TestBed, inject } from '@angular/core/testing';

import { ModPackService } from './modpack.service';

describe('ModPackService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ModPackService]
    });
  });

  it('should be created', inject([ModPackService], (service: ModPackService) => {
    expect(service).toBeTruthy();
  }));
});
