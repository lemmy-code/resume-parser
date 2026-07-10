-- Step 0 gate: prove pgvector works (extension + HNSW index + <=> cosine ordering).
-- Nothing in the RAG build proceeds until every check below returns as expected.

\echo '== pgvector version (record this — it gates the filtered-ANN handling in Step 5) =='
create extension if not exists vector;
select extversion as pgvector_version from pg_extension where extname = 'vector';

\echo '== build an HNSW cosine index on a throwaway table =='
drop table if exists smoke;
create table smoke (id int, embedding vector(3));
create index smoke_hnsw on smoke using hnsw (embedding vector_cosine_ops);

insert into smoke values (1, '[1,2,3]'), (2, '[4,5,6]'), (3, '[1,2,2]');

\echo '== nearest-neighbour ordering by cosine distance to [1,2,2] =='
\echo '== expect id=3 (closest) first, id=1 second =='
select id, embedding, embedding <=> '[1,2,2]' as cosine_distance
from smoke
order by embedding <=> '[1,2,2]';

\echo '== confirm the query actually uses the HNSW index (Index Scan, not Seq Scan) =='
set enable_seqscan = off;
explain (costs off)
select id from smoke order by embedding <=> '[1,2,2]' limit 2;
reset enable_seqscan;

drop table smoke;
\echo '== GATE PASSED if: version printed, index built, id=3 ranked first, plan shows Index Scan =='
