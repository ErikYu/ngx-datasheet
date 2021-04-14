import { Injectable } from '@angular/core';
import { fromEvent } from 'rxjs';
import { filter, map, pairwise, tap } from 'rxjs/operators';
import { ConfigService } from '../core/config.service';
import { ViewRangeService } from '../core/view-range.service';
import { DataService } from '../core/data.service';
import { SelectorsService } from '../core/selectors.service';
import { ResizerService } from './resizer.service';
import { ResizerThickness } from '../constants';
import { HistoryService } from './history.service';
import { TextInputService } from './text-input.service';
import { ContextmenuService } from './contextmenu.service';

@Injectable()
export class MouseEventService {
  private masker!: HTMLElement;
  private colResizer!: HTMLElement;
  private rowResizer!: HTMLElement;

  isSelecting = false;
  selectStartAt: [number | undefined, number | undefined] | null = null; // [ci, ri]

  isColResizing = false;
  isRowResizing = false;

  constructor(
    private configService: ConfigService,
    private viewRangeService: ViewRangeService,
    private dataService: DataService,
    private selectorRangeService: SelectorsService,
    private resizerService: ResizerService,
    private historyService: HistoryService,
    private textInputService: TextInputService,
    private contextmenuService: ContextmenuService,
  ) {}

  initDomElements(
    masker: HTMLElement,
    colResizer: HTMLElement,
    rowResizer: HTMLElement,
  ): void {
    this.masker = masker;
    this.colResizer = colResizer;
    this.rowResizer = rowResizer;

    fromEvent<MouseEvent>(this.masker, 'mousedown')
      .pipe(
        // tap((evt) => console.log(evt.target)),
        filter((evt) => evt.which === 1 || evt.which === 3),
      )
      .subscribe((mouseDownEvent) => {
        if (mouseDownEvent.detail === 1) {
          if (mouseDownEvent.which === 1) {
            this.isSelecting = true;
          }
          if (
            mouseDownEvent.which === 3 &&
            this.selectorRangeService.isNotEmpty
          ) {
            // check if click on one selector, if so, just display contextmenu without selecting cell
            const mouseLeft = mouseDownEvent.offsetX - this.configService.ciw;
            const mouseTop = mouseDownEvent.offsetY - this.configService.rih;
            const {
              left,
              top,
              width,
              height,
            } = this.viewRangeService.locateRect(
              this.selectorRangeService.last.range,
            );
            if (
              left <= mouseLeft &&
              mouseLeft <= left + width &&
              top <= mouseTop &&
              mouseTop <= top + height
            ) {
              return;
            }
          }
          const { hitRowIndex, hitColIndex } = this.getHitCell(mouseDownEvent);
          this.selectStartAt = [hitColIndex, hitRowIndex];
          // draw box
          if (hitRowIndex !== undefined && hitColIndex !== undefined) {
            const hitMerge = this.dataService.selectedSheet.getHitMerge(
              hitRowIndex,
              hitColIndex,
            );
            this.selectorRangeService.removeAll();
            if (hitMerge) {
              this.selectorRangeService.addRange(
                hitMerge.sri,
                hitMerge.eri,
                hitMerge.sci,
                hitMerge.eci,
              );
            } else {
              this.selectorRangeService.addOne(hitRowIndex, hitColIndex);
            }
          } else if (hitRowIndex !== undefined && hitColIndex === undefined) {
            this.selectorRangeService.removeAll();
            this.selectorRangeService.addWholeRow(hitRowIndex);
          } else if (hitRowIndex === undefined && hitColIndex !== undefined) {
            this.selectorRangeService.removeAll();
            this.selectorRangeService.addWholeColumn(hitColIndex);
          } else {
            this.selectorRangeService.removeAll();
            this.selectorRangeService.addAll();
          }
          this.textInputService.hide();
        } else if (mouseDownEvent.detail === 2 && mouseDownEvent.which === 1) {
          this.textInputService.show(false);
          this.textInputService.focus();
        }
      });

    fromEvent<MouseEvent>(this.masker, 'contextmenu')
      .pipe(
        tap((evt) => {
          evt.preventDefault();
          const xLeft = this.masker.getBoundingClientRect().width - evt.offsetX;
          const CONTEXTMENU_WIDTH = 150;
          if (xLeft < CONTEXTMENU_WIDTH) {
            this.contextmenuService.show(
              evt.offsetX - CONTEXTMENU_WIDTH,
              evt.offsetY,
            );
          } else {
            this.contextmenuService.show(evt.offsetX, evt.offsetY);
          }
        }),
      )
      .subscribe();

    fromEvent<MouseEvent>(this.masker, 'mousemove')
      .pipe(
        filter((mouseMoveEvent) => {
          if (!this.isSelecting) {
            if (this.isColResizing) {
              this.resizerService.moveColResizer(mouseMoveEvent.movementX);
            } else if (this.isRowResizing) {
              this.resizerService.moveRowResizer(mouseMoveEvent.movementY);
            } else {
              const inMask =
                mouseMoveEvent.target ===
                document.querySelector('.nd-editor-mask');
              if (!inMask) {
                this.resizerService.hideColResizer().hideRowResizer();
              } else {
                const isInRowHeader =
                  mouseMoveEvent.offsetY <= this.configService.rih;
                const isInColIndex =
                  mouseMoveEvent.offsetX <= this.configService.ciw;
                if (isInColIndex && isInRowHeader) {
                  // ignore me
                } else if (isInRowHeader) {
                  const {
                    right,
                    colIndex,
                  } = this.viewRangeService.cellRange.colIndexAt(
                    this.dataService.selectedSheet,
                    mouseMoveEvent.offsetX - this.configService.ciw,
                  );
                  this.resizerService.showColResizer(
                    right + this.configService.ciw - ResizerThickness,
                    colIndex,
                  );
                } else if (isInColIndex) {
                  const {
                    bottom,
                    rowIndex,
                  } = this.viewRangeService.cellRange.rowIndexAt(
                    this.dataService.selectedSheet,
                    mouseMoveEvent.offsetY - this.configService.rih,
                  );
                  this.resizerService.showRowResizer(
                    bottom + this.configService.rih - ResizerThickness,
                    rowIndex,
                  );
                }
              }
            }
          }
          return this.isSelecting;
        }),
        map((mouseMoveEvent) => ({
          ...this.getHitCell(mouseMoveEvent),
        })),
        pairwise(),
        filter(([before, after]) => {
          return (
            before.hitColIndex !== after.hitColIndex ||
            before.hitRowIndex !== after.hitRowIndex
          );
        }),
        map(([before, after]) => after),
      )
      .subscribe(({ hitRowIndex, hitColIndex }) => {
        // should only trigger when move out current cell
        const [startCI, startRI] = this.selectStartAt!;
        if (startCI === hitColIndex && startRI === hitRowIndex) {
          return;
        }
        if (startRI !== undefined && startCI !== undefined) {
          // cell range select
          if (hitRowIndex !== undefined && hitColIndex !== undefined) {
            this.selectorRangeService.lastResizeTo(hitRowIndex, hitColIndex);
          }
        } else if (startRI !== undefined && startCI === undefined) {
          // row range select
          if (hitRowIndex !== undefined) {
            this.selectorRangeService.lastResizeTo(hitRowIndex, undefined);
          }
        } else if (startRI === undefined && startCI !== undefined) {
          // col range select
          if (hitColIndex !== undefined) {
            this.selectorRangeService.lastResizeTo(undefined, hitColIndex);
          }
        }
      });

    fromEvent(this.colResizer, 'mousedown').subscribe(() => {
      this.isColResizing = true;
    });

    fromEvent(this.rowResizer, 'mousedown').subscribe(() => {
      this.isRowResizing = true;
    });

    fromEvent(document, 'mouseup').subscribe(() => {
      if (this.isColResizing) {
        this.isColResizing = false;
        this.historyService.stacked(() => {
          this.resizerService.pinColResizer().hideColResizer();
        });
        this.dataService.rerender();
      }
      if (this.isRowResizing) {
        this.isRowResizing = false;
        this.historyService.stacked(() => {
          this.resizerService.pinRowResizer().hideRowResizer();
        });
        this.dataService.rerender();
      }
      this.isSelecting = false;
      this.selectStartAt = null;
    });
  }

  private getHitCell(
    evt: MouseEvent,
  ): {
    hitRowIndex: number | undefined;
    hitColIndex: number | undefined;
  } {
    let hitRowIndex!: number;
    let hitColIndex!: number;
    const { rih, ciw } = this.configService;
    const { cellRange: viewRange } = this.viewRangeService;
    const { offsetY, offsetX } = this.offsetRelatedTo(evt, rih, ciw);
    if (offsetY > 0) {
      ({ rowIndex: hitRowIndex } = viewRange.rowIndexAt(
        this.dataService.selectedSheet,
        offsetY,
      ));
    }
    if (offsetX > 0) {
      ({ colIndex: hitColIndex } = viewRange.colIndexAt(
        this.dataService.selectedSheet,
        offsetX,
      ));
    }
    return {
      hitRowIndex,
      hitColIndex,
    };
  }

  private offsetRelatedTo(
    evt: MouseEvent,
    rowIndexHeight: number,
    colIndexWidth: number,
  ): {
    offsetY: number;
    offsetX: number;
  } {
    return {
      offsetX: evt.offsetX - colIndexWidth,
      offsetY: evt.offsetY - rowIndexHeight,
    };
  }
}
