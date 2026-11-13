# 移植元 generative-ai-adapter の検証用 DB（embedding-adapter/src/test/docker/graph-db）と同じ構成。
# 検索のハイブリッド検索で PGroonga、Graph RAG で Apache AGE を使う
FROM pgvector/pgvector:0.8.2-pg16-bookworm

ARG APACHE_AGE_REF=PG16/v1.6.0-rc0
ARG PGROONGA_PACKAGE=postgresql-16-pgdg-pgroonga
ARG PGROONGA_PACKAGE_VERSION=4.0.6-1
ARG PGROONGA_DEBIAN_CODENAME=bookworm

USER root

# AGE はソースからビルドする。ビルドにだけ使うパッケージは最後に消す
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        wget \
    && wget -q "https://packages.groonga.org/debian/groonga-apt-source-latest-${PGROONGA_DEBIAN_CODENAME}.deb" -O /tmp/groonga-apt-source.deb \
    && apt-get install -y --no-install-recommends /tmp/groonga-apt-source.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends "${PGROONGA_PACKAGE}=${PGROONGA_PACKAGE_VERSION}" \
    && BUILD_DEPS="bison build-essential flex git postgresql-server-dev-16" \
    && apt-get install -y --no-install-recommends $BUILD_DEPS \
    && git clone --depth 1 --branch "${APACHE_AGE_REF}" https://github.com/apache/age.git /tmp/apache-age \
    && make -C /tmp/apache-age PG_CONFIG=/usr/lib/postgresql/16/bin/pg_config install \
    && apt-get purge -y --auto-remove $BUILD_DEPS wget \
    && rm -rf /tmp/apache-age /tmp/groonga-apt-source.deb /var/lib/apt/lists/*
