FROM ubuntu:24.04

ARG NODE_VERSION
ARG VITE_PLUS_VERSION

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential ca-certificates curl file git imagemagick jq libasound2t64 libgbm1 \
    libgtk-3-0t64 libnss3 libsecret-1-dev patchelf pkg-config python3 unzip xz-utils \
  && rm -rf /var/lib/apt/lists/*

ENV RUSTUP_HOME=/opt/rustup \
  CARGO_HOME=/opt/cargo \
  PATH=/opt/node/bin:/opt/cargo/bin:$PATH

RUN curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
    | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable \
  && chmod -R a+rX /opt/rustup /opt/cargo

RUN mkdir -p /opt/node /tmp/node \
  && cd /tmp/node \
  && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" \
  && curl -fsSLO "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" \
  && grep " node-v${NODE_VERSION}-linux-x64.tar.xz\$" SHASUMS256.txt | sha256sum -c - \
  && tar -xJf "node-v${NODE_VERSION}-linux-x64.tar.xz" -C /opt/node --strip-components=1 \
  && cd / \
  && rm -rf /tmp/node \
  && npm install -g "vite-plus@${VITE_PLUS_VERSION}" \
  && chmod -R a+rX /opt/node
