import { EventEmitter } from "events";
import type { PurchasePaidPayload } from "../types";

export type BusEvents = {
  "purchase.paid": PurchasePaidPayload;
  "pdf.started": { orderId: string; jobId: string };
  "pdf.completed": { orderId: string; jobId: string; receiptPath: string };
  "pdf.failed": { orderId: string; jobId: string; error: string };
};

type Handler<T> = (payload: T) => void | Promise<void>;

class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  on<K extends keyof BusEvents>(event: K, handler: Handler<BusEvents[K]>): void {
    this.emitter.on(event, handler);
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    this.emitter.emit(event, payload);
  }
}

export const bus = new TypedEventBus();
