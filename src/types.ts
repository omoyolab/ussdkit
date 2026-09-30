/** One request from a gateway, normalised so the app never sees gateway specifics. */
export interface UssdRequest {
  /** Gateway session id. All requests for one dial share it. */
  sessionId: string;
  /** Subscriber phone number as the gateway sends it, e.g. `+2348012345678`. */
  phone: string;
  /** Dialled code, e.g. `*384*1234#`. */
  serviceCode: string;
  /** The user's latest input. Empty string on the first request of a session. */
  input: string;
  /**
   * Every input the user has sent so far, oldest first, when the gateway provides it.
   * Lets ussdkit rebuild a session that expired or was never stored.
   */
  inputs?: string[];
  /** Mobile network code, when the gateway sends it. */
  network?: string;
}

export interface UssdResponse {
  /** Text shown on the phone. */
  text: string;
  /** True ends the session after this screen. */
  end: boolean;
}

export interface Session {
  id: string;
  phone: string;
  serviceCode: string;
  /** Id of the screen the user is on. */
  screen: string;
  /** Screen ids visited before the current one, for back navigation. */
  history: string[];
  /** Anything handlers store with `goto` or by mutating `ctx.data`. */
  data: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
}

export interface SessionStore {
  get(id: string): Promise<Session | undefined>;
  set(session: Session, ttlSeconds: number): Promise<void>;
  delete(id: string): Promise<void>;
}

/** What a screen handler returns to say where the user goes next. */
export type Next =
  | { goto: string; data?: Record<string, unknown> }
  | { retry: string }
  | { end: string }
  | { back: true }
  | { home: true };

export interface Context {
  /** Latest user input. Empty on the first render of a session. */
  input: string;
  phone: string;
  serviceCode: string;
  network: string | undefined;
  /** Id of the current screen. */
  screen: string;
  /** Shortcut to `session.data`. Mutations persist. */
  data: Record<string, unknown>;
  session: Session;
}

export type Renderer = string | ((ctx: Context) => string | Promise<string>);

export interface Screen {
  /** Text shown when the user lands on this screen. */
  render: Renderer;
  /** Called with the user's input. Leave it out for an end screen. */
  handle?: (ctx: Context) => Next | Promise<Next>;
}

export interface AppOptions {
  /** Id of the first screen. Default `home`. */
  home?: string;
  /** Input that goes back one screen. Default `0`. Set `false` to disable. */
  backKey?: string | false;
  /** Input that returns to the home screen. Default `00`. Set `false` to disable. */
  homeKey?: string | false;
  /** Where sessions live. Default in-memory. */
  store?: SessionStore;
  /** Seconds of inactivity before a session is dropped. Default 180. */
  ttl?: number;
  /** Warn when a screen's text exceeds this many characters. Default 182. */
  maxLength?: number;
  /** Receives warnings such as over-long screens. Default `console.warn`. */
  onWarning?: (message: string) => void;
  /** Text prefixed to the screen when a menu gets an unknown option. Default `Invalid choice.` */
  invalidText?: string;
}

/** Translates between a gateway's wire format and ussdkit's request/response. */
export interface Gateway<Req = unknown, Res = unknown> {
  name: string;
  parse(request: Req): UssdRequest;
  format(response: UssdResponse): Res;
  /** Content type of the formatted response. */
  contentType: string;
}
