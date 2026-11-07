-module(beam_fleet_ffi).
-export([is_exit/1, open_seat/2, os_pid/1, kill_os/1, listen/1, serve/2, now_ms/0, env/2, ledger_new/0, ledger_bump/2, ledger_all/0]).

open_seat(Command, Name) ->
    Port = erlang:open_port({spawn_executable, "/bin/sh"}, [exit_status, binary, stderr_to_stdout, {line, 4096}, {args, ["-c", binary_to_list(Command)]}]),
    put(seat_name, Name),
    Port.

is_exit({Port, {exit_status, _}}) when is_port(Port) -> true;
is_exit(_) -> false.

os_pid(Port) ->
    case erlang:port_info(Port, os_pid) of
        {os_pid, Pid} -> Pid;
        _ -> 0
    end.

kill_os(Pid) ->
    os:cmd("kill -9 " ++ integer_to_list(Pid)),
    nil.

now_ms() -> erlang:system_time(millisecond).

env(Name, Default) ->
    case os:getenv(binary_to_list(Name)) of
        false -> Default;
        Value -> list_to_binary(Value)
    end.

ledger_new() ->
    case ets:info(beam_fleet_ledger) of
        undefined -> ets:new(beam_fleet_ledger, [named_table, public, set]), nil;
        _ -> nil
    end.

ledger_bump(Key, Value) ->
    ets:insert(beam_fleet_ledger, {Key, Value}),
    nil.

ledger_all() ->
    ets:tab2list(beam_fleet_ledger).

listen(Port) ->
    {ok, Socket} = gen_tcp:listen(Port, [binary, {packet, http_bin}, {active, false}, {reuseaddr, true}]),
    Socket.

serve(Socket, Handler) ->
    {ok, Client} = gen_tcp:accept(Socket),
    spawn(fun() -> answer(Client, Handler) end),
    serve(Socket, Handler).

answer(Client, Handler) ->
    case gen_tcp:recv(Client, 0, 10000) of
        {ok, {http_request, Method, {abs_path, Path}, _}} ->
            drain(Client),
            Body = Handler(atom_to_binary_safe(Method), Path),
            Reply = [<<"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\ncontent-length: ">>,
                     integer_to_binary(byte_size(Body)), <<"\r\nconnection: close\r\n\r\n">>, Body],
            gen_tcp:send(Client, Reply);
        _ -> ok
    end,
    gen_tcp:close(Client).

drain(Client) ->
    case gen_tcp:recv(Client, 0, 10000) of
        {ok, http_eoh} -> ok;
        {ok, _} -> drain(Client);
        _ -> ok
    end.

atom_to_binary_safe(Method) when is_atom(Method) -> atom_to_binary(Method);
atom_to_binary_safe(Method) -> Method.
