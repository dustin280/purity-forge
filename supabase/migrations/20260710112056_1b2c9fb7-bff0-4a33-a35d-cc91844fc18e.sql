CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.ai_knowledge_docs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  source_filename text,
  agent_scope text NOT NULL DEFAULT 'both',
  page_count int,
  chunk_count int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_knowledge_docs_scope_chk CHECK (agent_scope IN ('both','column_advisor','troubleshooting'))
);

GRANT SELECT ON public.ai_knowledge_docs TO authenticated;
GRANT ALL ON public.ai_knowledge_docs TO service_role;

ALTER TABLE public.ai_knowledge_docs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read knowledge docs"
  ON public.ai_knowledge_docs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage knowledge docs"
  ON public.ai_knowledge_docs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ai_knowledge_docs_updated_at
  BEFORE UPDATE ON public.ai_knowledge_docs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.ai_knowledge_docs(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,
  content text NOT NULL,
  page_number int,
  embedding vector(3072) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_knowledge_chunks TO authenticated;
GRANT ALL ON public.ai_knowledge_chunks TO service_role;

ALTER TABLE public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read knowledge chunks"
  ON public.ai_knowledge_chunks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage knowledge chunks"
  ON public.ai_knowledge_chunks FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX ai_knowledge_chunks_doc_idx ON public.ai_knowledge_chunks(doc_id);
CREATE INDEX ai_knowledge_chunks_embedding_idx
  ON public.ai_knowledge_chunks
  USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_ai_knowledge_chunks(
  query_embedding vector(3072),
  match_count int DEFAULT 6,
  scope_filter text DEFAULT NULL
)
RETURNS TABLE (
  chunk_id uuid,
  doc_id uuid,
  doc_title text,
  page_number int,
  content text,
  similarity float
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id AS chunk_id,
    c.doc_id,
    d.title AS doc_title,
    c.page_number,
    c.content,
    1 - (c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.ai_knowledge_chunks c
  JOIN public.ai_knowledge_docs d ON d.id = c.doc_id
  WHERE scope_filter IS NULL
     OR d.agent_scope = 'both'
     OR d.agent_scope = scope_filter
  ORDER BY c.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

REVOKE ALL ON FUNCTION public.match_ai_knowledge_chunks(vector, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.match_ai_knowledge_chunks(vector, int, text) TO authenticated, service_role;