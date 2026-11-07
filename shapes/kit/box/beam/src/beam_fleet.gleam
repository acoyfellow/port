import gleam/dynamic.{type Dynamic}
import gleam/erlang/process
import gleam/int
import gleam/json
import gleam/list
import gleam/otp/actor
import gleam/otp/static_supervisor as supervisor
import gleam/otp/supervision
import gleam/string

pub type Port

pub type Socket

@external(erlang, "beam_fleet_ffi", "open_seat")
fn open_seat(command: String, name: String) -> Port

@external(erlang, "beam_fleet_ffi", "is_exit")
fn is_exit(message: Dynamic) -> Bool

@external(erlang, "beam_fleet_ffi", "os_pid")
fn os_pid(port: Port) -> Int

@external(erlang, "beam_fleet_ffi", "kill_os")
fn kill_os(pid: Int) -> Nil

@external(erlang, "beam_fleet_ffi", "listen")
fn listen(port: Int) -> Socket

@external(erlang, "beam_fleet_ffi", "serve")
fn serve(socket: Socket, handler: fn(String, String) -> String) -> Nil

@external(erlang, "beam_fleet_ffi", "now_ms")
fn now_ms() -> Int

@external(erlang, "beam_fleet_ffi", "env")
fn env(name: String, default: String) -> String

@external(erlang, "beam_fleet_ffi", "ledger_new")
fn ledger_new() -> Nil

@external(erlang, "beam_fleet_ffi", "ledger_bump")
fn ledger_bump(key: String, value: Dynamic) -> Nil

@external(erlang, "beam_fleet_ffi", "ledger_all")
fn ledger_all() -> List(#(String, Dynamic))

@external(erlang, "erlang", "binary_to_term")
fn decode(value: Dynamic) -> SeatRecord

@external(erlang, "erlang", "term_to_binary")
fn encode(value: SeatRecord) -> Dynamic

pub type SeatRecord {
  SeatRecord(seat: Int, user: String, os_pid: Int, starts: Int, started_at: Int)
}

pub fn seat_user(seat: Int) -> String {
  "agent" <> int.to_string(seat)
}

pub fn seat_port(seat: Int) -> Int {
  8080 + seat
}

pub fn seat_command(seat: Int) -> String {
  let user = seat_user(seat)
  "exec env HOME=/home/"
  <> user
  <> " PI_ENV_ROOT=/home/"
  <> user
  <> " PI_ENV_PORT="
  <> int.to_string(seat_port(seat))
  <> " setpriv --reuid="
  <> user
  <> " --regid="
  <> user
  <> " --init-groups node /opt/pi-env/env-server.mjs"
}

fn record(seat: Int) -> SeatRecord {
  let key = int.to_string(seat)
  case list.key_find(ledger_all(), key) {
    Ok(value) -> decode(value)
    Error(Nil) -> SeatRecord(seat, seat_user(seat), 0, 0, 0)
  }
}

fn save(entry: SeatRecord) -> Nil {
  ledger_bump(int.to_string(entry.seat), encode(entry))
}

type SeatMessage {
  PortMessage(Dynamic)
}

fn start_seat(seat: Int) -> Result(actor.Started(Nil), actor.StartError) {
  actor.new_with_initialiser(10_000, fn(_subject) {
    let command = case env("BEAM_SEAT_COMMAND", "") {
      "" -> seat_command(seat)
      stand_in -> stand_in
    }
    let port = open_seat(command, seat_user(seat))
    let previous = record(seat)
    save(SeatRecord(
      seat,
      seat_user(seat),
      os_pid(port),
      previous.starts + 1,
      now_ms(),
    ))
    let selector =
      process.new_selector()
      |> process.select_other(PortMessage)
    actor.initialised(Nil)
    |> actor.selecting(selector)
    |> Ok
  })
  |> actor.on_message(fn(state, message) {
    let PortMessage(payload) = message
    case is_exit(payload) {
      True -> actor.stop_abnormal("seat process exited")
      False -> actor.continue(state)
    }
  })
  |> actor.start
}

pub fn seat_numbers() -> List(Int) {
  int.range(from: seats(), to: 0, with: [], run: list.prepend)
}

pub fn seats() -> Int {
  case int.parse(env("BEAM_SEATS", "5")) {
    Ok(count) -> count
    Error(Nil) -> 5
  }
}

fn seat_json(entry: SeatRecord) -> json.Json {
  json.object([
    #("seat", json.int(entry.seat)),
    #("user", json.string(entry.user)),
    #("osPid", json.int(entry.os_pid)),
    #("starts", json.int(entry.starts)),
    #("startedAt", json.int(entry.started_at)),
  ])
}

fn status() -> String {
  json.object([
    #("ok", json.bool(True)),
    #("supervisor", json.string("one_for_one")),
    #("seats", json.array(seat_numbers(), fn(seat) { seat_json(record(seat)) })),
  ])
  |> json.to_string
}

fn kill(path: String) -> String {
  let seat = case string.split(path, "/") {
    ["", "kill", raw] -> int.parse(raw)
    _ -> Error(Nil)
  }
  case seat {
    Ok(number) -> {
      let before = record(number)
      kill_os(before.os_pid)
      json.object([
        #("killed", json.int(number)),
        #("osPid", json.int(before.os_pid)),
        #("startsBefore", json.int(before.starts)),
      ])
      |> json.to_string
    }
    Error(Nil) -> "{\"error\":\"use /kill/<seat>\"}"
  }
}

fn handle(method: String, path: String) -> String {
  case method, path {
    "POST", "/kill/" <> _ -> kill(path)
    _, _ -> status()
  }
}

pub fn main() -> Nil {
  ledger_new()
  let assert Ok(_) =
    seat_numbers()
    |> list.fold(
      supervisor.new(supervisor.OneForOne)
        |> supervisor.restart_tolerance(intensity: 20, period: 60),
      fn(builder, seat) {
        supervisor.add(builder, supervision.worker(fn() { start_seat(seat) }))
      },
    )
    |> supervisor.start
  let control = int.parse(env("BEAM_CONTROL_PORT", "8090"))
  let socket = case control {
    Ok(port) -> listen(port)
    Error(Nil) -> listen(8090)
  }
  serve(socket, handle)
}
