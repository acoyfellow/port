import beam_fleet
import gleeunit

pub fn main() -> Nil {
  gleeunit.main()
}

pub fn seat_numbers_test() {
  assert beam_fleet.seat_numbers() == [1, 2, 3, 4, 5]
}

pub fn seat_port_test() {
  assert beam_fleet.seat_port(3) == 8083
}

pub fn seat_command_runs_as_its_own_user_test() {
  assert beam_fleet.seat_command(2)
    == "exec env HOME=/home/agent2 PI_ENV_ROOT=/home/agent2 PI_ENV_PORT=8082 setpriv --reuid=agent2 --regid=agent2 --init-groups node /opt/pi-env/env-server.mjs"
}
