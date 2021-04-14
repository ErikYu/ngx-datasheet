import { Injectable } from '@angular/core';
import { DatasheetConfig, DatasheetConfigExtended } from '../models';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, throttleTime } from 'rxjs/operators';
import { RenderProxyService } from '../service/render-proxy.service';

const toolbarHeight = 30;
const formulaBarHeight = 25;

@Injectable()
export class ConfigService {
  readonly tabBarHeight = 30;
  readonly scrollbarThick = 16;

  constructor(private renderProxyService: RenderProxyService) {}

  get config$(): Observable<DatasheetConfigExtended> {
    return this._config$
      .asObservable()
      .pipe(
        filter((i) => !!i, throttleTime(100)),
      ) as Observable<DatasheetConfigExtended>;
  }

  get snapshot(): DatasheetConfigExtended {
    return this._config$.value;
  }

  get defaultCW(): number {
    return this.snapshot.col.width || 100;
  }

  get defaultRH(): number {
    return this.snapshot.row.height || 25;
  }

  get rih(): number {
    return this.snapshot.row.indexHeight || 25;
  }

  get ciw(): number {
    return this.snapshot.col.indexWidth || 60;
  }

  private _config$ = new BehaviorSubject<DatasheetConfigExtended>({
    width: () => document.documentElement.clientWidth,
    height: () => document.documentElement.clientHeight,
    row: {
      height: 25,
      count: 100,
      indexHeight: 25,
    },
    col: {
      width: 100,
      count: 30,
      indexWidth: 60,
    },
    sheetHeight: 0,
    sheetWidth: 0,
  });

  resize(container: HTMLElement): void {
    this._config$.next({
      ...this.snapshot,
      sheetHeight:
        container.getBoundingClientRect().height -
        toolbarHeight -
        formulaBarHeight,
      sheetWidth: container.getBoundingClientRect().width,
    });
    this.renderProxyService.render('all');
  }

  setConfig(val: DatasheetConfig, container: HTMLElement): void {
    this._config$.next({
      ...this.snapshot,
      sheetHeight:
        container.getBoundingClientRect().height -
        toolbarHeight -
        formulaBarHeight,
      sheetWidth: container.getBoundingClientRect().width,
    });
    this.renderProxyService.render('all');
  }
}
