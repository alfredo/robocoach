run:
	yarn parcel src/index.html

build:
	corepack enable
	yarn install

clean:
	rm -rf .parcel-cache
