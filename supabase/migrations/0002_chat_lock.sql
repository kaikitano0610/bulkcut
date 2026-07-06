-- Serializes /api/chat processing so overlapping requests (e.g. a message sent
-- before the previous one finished) cannot run concurrent, unsynchronized agent
-- loops that each act on a stale snapshot of the day's records.
create table chat_lock (
  id int primary key default 1 check (id = 1),
  processing_since timestamptz
);
insert into chat_lock (id, processing_since) values (1, null);
