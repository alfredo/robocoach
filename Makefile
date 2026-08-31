# `build` installs dependencies; `run` stages the MediaPipe Wasm runtime and
# model weights into dist/ (see scripts/fetch-assets.mjs) before serving.

run:
	yarn start

build:
	corepack enable
	yarn install

dist:
	yarn build

assets:
	yarn fetch-assets --all

clean:
	rm -rf .parcel-cache dist

.PHONY: run build dist assets clean
