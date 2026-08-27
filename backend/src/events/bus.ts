import { EventEmitter } from "events";
import type { PurchasePaidPayload } from "../types";
import { log } from "../utils/logger";

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
    log("event-bus", "Listener registered", { event });
    this.emitter.on(event, (payload: BusEvents[K]) => {
      log("event-bus", "Dispatching event to listener", {
        event,
        orderId: "orderId" in (payload as object) ? (payload as { orderId: string }).orderId : undefined,
      });
      void handler(payload);
    });
  }

  emit<K extends keyof BusEvents>(event: K, payload: BusEvents[K]): void {
    const listenerCount = this.emitter.listenerCount(event);
    log("event-bus", "emit()", {
      event,
      listenerCount,
      orderId: "orderId" in (payload as object) ? (payload as { orderId: string }).orderId : undefined,
    });
    this.emitter.emit(event, payload);
  }
}

export const bus = new TypedEventBus();
