import type { Socket } from "node:net";
import type { RpcConnectionSink } from "./connection-handler.ts";

/**
 * The output side of one accepted socket connection.
 *
 * `writeRaw` receives already-serialized JSONL text; `waitForBackpressure` reports the
 * transport's own `drain` signal, and `close` tears the connection down once its event
 * queue can no longer deliver (byte overflow, dead-peer stall, write failure).
 */
export function socketSink(socket: Socket): RpcConnectionSink {
	let needsDrain = false;
	return {
		writeRaw(chunk) {
			if (!socket.destroyed) needsDrain = !socket.write(chunk);
		},
		close() {
			socket.destroy();
		},
		waitForBackpressure() {
			if (socket.destroyed || !needsDrain) return Promise.resolve();
			needsDrain = false;
			return new Promise<void>((resolve) => {
				const done = () => {
					socket.off("drain", done);
					socket.off("close", done);
					resolve();
				};
				socket.once("drain", done);
				socket.once("close", done);
			});
		},
	};
}
