import { UssdkitError } from "./errors.js";
import { MemoryStore } from "./session/memory.js";
import type {
  AppOptions,
  Context,
  Next,
  Screen,
  Session,
  SessionData,
  SessionStore,
  Start,
  UssdRequest,
  UssdResponse,
} from "./types.js";

export interface ResolvedOptions<D extends object = SessionData> {
  home: string;
  backKey: string | false;
  homeKey: string | false;
  backHint: string | undefined;
  onStart: AppOptions<D>["onStart"];
  store: SessionStore;
  ttl: number;
  maxLength: number;
  onWarning: (message: string) => void;
  invalidText: string;
}

export interface App<D extends object = SessionData> {
  readonly options: ResolvedOptions<D>;
  readonly screens: ReadonlyMap<string, Screen<D>>;
  /** Registers a screen. Returns the app so calls chain. */
  screen(id: string, screen: Screen<D>): App<D>;
  /** Handles one gateway request. This is the whole runtime. */
  handle(request: UssdRequest): Promise<UssdResponse>;
}

/** An app whatever its session data, for helpers that only call `handle`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the data type does not matter to these helpers
export type AnyApp = App<any>;

/**
 * Creates an app. Give it the shape of your session data and every screen's `ctx.data` is typed:
 *
 * @example
 * interface Flow { amount: number; recipient: string }
 * const app = createApp<Flow>();
 */
export function createApp<D extends object = SessionData>(options: AppOptions<D> = {}): App<D> {
  const resolved: ResolvedOptions<D> = {
    home: options.home ?? "home",
    backKey: options.backKey ?? "0",
    homeKey: options.homeKey ?? "00",
    backHint: options.backHint,
    onStart: options.onStart,
    store: options.store ?? new MemoryStore(),
    ttl: options.ttl ?? 180,
    maxLength: options.maxLength ?? 182,
    onWarning: options.onWarning ?? ((message) => console.warn(`ussdkit: ${message}`)),
    invalidText: options.invalidText ?? "Invalid choice.",
  };
  const screens = new Map<string, Screen<D>>();

  function getScreen(id: string): Screen<D> {
    const screen = screens.get(id);
    if (!screen) {
      throw new UssdkitError(
        `Unknown screen "${id}"`,
        `Register it with app.screen("${id}", ...). Known screens: ${[...screens.keys()].join(", ") || "none"}`,
      );
    }
    return screen;
  }

  function context(
    session: Session,
    request: UssdRequest,
    input: string,
    replaying: boolean,
  ): Context<D> {
    return {
      input,
      phone: session.phone,
      serviceCode: session.serviceCode,
      network: request.network,
      screen: session.screen,
      data: session.data as Partial<D>,
      session,
      replaying,
    };
  }

  /** True when the back key will be taken on this screen. */
  function backWorks(session: Session, screen: Screen<D>): boolean {
    return resolved.backKey !== false && screen.back !== false && session.history.length > 0;
  }

  async function render(
    session: Session,
    request: UssdRequest,
    replaying: boolean,
    prefix?: string,
  ): Promise<UssdResponse> {
    const screen = getScreen(session.screen);
    const ctx = context(session, request, "", replaying);
    const body = typeof screen.render === "string" ? screen.render : await screen.render(ctx);
    const isEnd = screen.handle === undefined;
    const parts = [
      prefix,
      body,
      !isEnd && resolved.backHint && backWorks(session, screen) ? resolved.backHint : "",
    ];
    const text = parts.filter((part) => part).join("\n");
    if (text.length > resolved.maxLength) {
      resolved.onWarning(
        `screen "${session.screen}" is ${text.length} characters, over the ${resolved.maxLength} limit. Some phones will cut it off.`,
      );
    }
    return { text, end: isEnd };
  }

  function goBack(session: Session): void {
    const previous = session.history.pop();
    if (previous !== undefined) session.screen = previous;
  }

  function goHome(session: Session): void {
    session.history = [];
    session.screen = resolved.home;
  }

  function moveTo(
    session: Session,
    id: string,
    data: Partial<D> | undefined,
    remember: boolean,
  ): void {
    getScreen(id);
    if (data) Object.assign(session.data, data);
    if (remember) session.history.push(session.screen);
    session.screen = id;
  }

  async function step(
    session: Session,
    request: UssdRequest,
    input: string,
    replaying: boolean,
  ): Promise<UssdResponse> {
    const screen = getScreen(session.screen);

    if (resolved.homeKey !== false && screen.home !== false && input === resolved.homeKey) {
      goHome(session);
      return render(session, request, replaying);
    }
    if (input === resolved.backKey && backWorks(session, screen)) {
      goBack(session);
      return render(session, request, replaying);
    }

    if (!screen.handle) {
      // An end screen received input, which means the gateway kept the session open.
      return { ...(await render(session, request, replaying)), end: true };
    }

    const next: Next<D> = await screen.handle(context(session, request, input, replaying));

    if ("retry" in next) {
      return render(session, request, replaying, next.retry);
    }
    if ("end" in next) {
      return { text: next.end, end: true };
    }
    if ("back" in next) {
      goBack(session);
      return render(session, request, replaying);
    }
    if ("home" in next) {
      goHome(session);
      return render(session, request, replaying);
    }
    // A transient screen is not remembered, so Back from the next screen skips it.
    moveTo(session, next.goto, next.data, screen.transient !== true);
    return render(session, request, replaying);
  }

  function newSession(request: UssdRequest, now: number): Session {
    return {
      id: request.sessionId,
      phone: request.phone,
      serviceCode: request.serviceCode,
      screen: resolved.home,
      history: [],
      data: {},
      startedAt: now,
      updatedAt: now,
    };
  }

  /** Runs `onStart` for a new session. Returns a response when it ended the session. */
  async function start(
    session: Session,
    request: UssdRequest,
    replaying: boolean,
  ): Promise<UssdResponse | undefined> {
    if (!resolved.onStart) return undefined;
    const result: Start<D> | void = await resolved.onStart(
      context(session, request, "", replaying),
    );
    if (!result) return undefined;
    if ("end" in result) return { text: result.end, end: true };
    moveTo(session, result.goto, result.data, false);
    return undefined;
  }

  async function finish(session: Session, response: UssdResponse): Promise<UssdResponse> {
    if (response.end) {
      await resolved.store.delete(session.id);
    } else {
      session.updatedAt = Date.now();
      await resolved.store.set(session, resolved.ttl);
    }
    return response;
  }

  const app: App<D> = {
    options: resolved,
    screens,
    screen(id, screen) {
      if (screens.has(id)) {
        throw new UssdkitError(`Screen "${id}" is already registered`);
      }
      screens.set(id, screen);
      return app;
    },
    async handle(request) {
      if (!request.sessionId) {
        throw new UssdkitError(
          "Request has no sessionId",
          "Every gateway request must carry a session id",
        );
      }
      getScreen(resolved.home);

      let session = await resolved.store.get(request.sessionId);

      if (!session) {
        session = newSession(request, Date.now());
        const inputs = request.inputs ?? (request.input === "" ? [] : [request.input]);

        const ended = await start(session, request, inputs.length > 0);
        if (ended) return finish(session, ended);

        if (inputs.length === 0) {
          return finish(session, await render(session, request, false));
        }
        // No stored session but the gateway told us everything typed so far: replay it.
        // Every input but the last has been handled before, in a request we no longer remember.
        let response: UssdResponse = { text: "", end: false };
        for (const [i, input] of inputs.entries()) {
          response = await step(session, request, input, i < inputs.length - 1);
          if (response.end) break;
        }
        return finish(session, response);
      }

      return finish(session, await step(session, request, request.input, false));
    },
  };

  return app;
}
