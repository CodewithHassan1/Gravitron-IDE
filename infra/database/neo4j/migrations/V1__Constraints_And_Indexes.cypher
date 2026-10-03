# Neo4j Constraints & Indexes
CREATE CONSTRAINT file_path_unique IF NOT EXISTS FOR (f:File) REQUIRE f.path IS UNIQUE;
CREATE CONSTRAINT class_name_unique IF NOT EXISTS FOR (c:Class) REQUIRE (c.name, c.file) IS UNIQUE;

CREATE INDEX idx_function_name IF NOT EXISTS FOR (f:Function) ON (f.name);
CREATE INDEX idx_variable_name IF NOT EXISTS FOR (v:Variable) ON (v.name);
