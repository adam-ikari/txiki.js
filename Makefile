BUILD_DIR=build
BUILDTYPE?=Release

JOBS?=$(shell getconf _NPROCESSORS_ONLN)
ifeq ($(JOBS),)
JOBS := $(shell sysctl -n hw.ncpu)
endif
ifeq ($(JOBS),)
JOBS := $(shell nproc)
endif
ifeq ($(JOBS),)
JOBS := 4
endif

TJS=$(BUILD_DIR)/tjs
QJSC=$(BUILD_DIR)/tjsc
CMAKE?=$(shell which cmake)
STDLIB_MODULES=$(wildcard src/js/stdlib/*.js)
ESBUILD?=npx esbuild
ESBUILD_PARAMS_COMMON=--target=es2023 --platform=neutral --format=esm --main-fields=main,module
ESBUILD_PARAMS_MINIFY=--minify --keep-names
QJSC_PARAMS_STIP=-s
JS_NO_STRIP?=0
BUILD_MACOS_MULTIARCH?=0
EXTRA_CMAKE_PARAMS=

ifeq ($(JS_NO_STRIP),1)
	ESBUILD_PARAMS_MINIFY=
	QJSC_PARAMS_STIP=
endif

ifeq ($(BUILD_MACOS_MULTIARCH),1)
	EXTRA_CMAKE_PARAMS=-DCMAKE_OSX_ARCHITECTURES="x86_64;arm64"
endif

all: $(TJS)

$(BUILD_DIR):
	$(CMAKE) -B $(BUILD_DIR) -DCMAKE_BUILD_TYPE=$(BUILDTYPE) $(EXTRA_CMAKE_PARAMS)

$(TJS): $(BUILD_DIR)
	$(CMAKE) --build $(BUILD_DIR) -j $(JOBS)

$(QJSC): $(BUILD_DIR)
	$(CMAKE) --build $(BUILD_DIR) --target tjsc -j $(JOBS)

src/bundles/js/core/polyfills.js: src/js/polyfills/*.js
	$(ESBUILD) src/js/polyfills/index.js \
		--bundle \
		--metafile=$@.json \
		--outfile=$@ \
		$(ESBUILD_PARAMS_MINIFY) \
		$(ESBUILD_PARAMS_COMMON)

src/bundles/c/core/polyfills.c: $(QJSC) src/bundles/js/core/polyfills.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "polyfills.js" \
		-p tjs__ \
		src/bundles/js/core/polyfills.js

src/bundles/js/core/core.js: src/js/core/*.js
	$(ESBUILD) src/js/core/index.js \
		--bundle \
		--metafile=$@.json \
		--outfile=$@ \
		$(ESBUILD_PARAMS_MINIFY) \
		$(ESBUILD_PARAMS_COMMON)

src/bundles/c/core/core.c: $(QJSC) src/bundles/js/core/core.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "core.js" \
		-p tjs__ \
		src/bundles/js/core/core.js

src/bundles/js/core/run-main.js: src/js/run-main/*.js
	$(ESBUILD) src/js/run-main/index.js \
		--bundle \
		--metafile=$@.json \
		--outfile=$@ \
		--external:tjs:* \
		$(ESBUILD_PARAMS_MINIFY) \
		$(ESBUILD_PARAMS_COMMON)

src/bundles/c/core/run-main.c: $(QJSC) src/bundles/js/core/run-main.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "run-main.js" \
		-p tjs__ \
		src/bundles/js/core/run-main.js

src/bundles/js/core/run-repl.js: src/js/run-repl/*.js
	$(ESBUILD) src/js/run-repl/index.js \
		--bundle \
		--metafile=$@.json \
		--outfile=$@ \
		--external:tjs:* \
		--log-override:direct-eval=silent \
		$(ESBUILD_PARAMS_MINIFY) \
		$(ESBUILD_PARAMS_COMMON)

src/bundles/c/core/run-repl.c: $(QJSC) src/bundles/js/core/run-repl.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "run-repl.js" \
		-p tjs__ \
		src/bundles/js/core/run-repl.js

src/bundles/c/core/worker-bootstrap.c: $(QJSC) src/js/worker/worker-bootstrap.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "worker-bootstrap.js" \
		-p tjs__ \
		src/js/worker/worker-bootstrap.js

core: src/bundles/c/core/polyfills.c src/bundles/c/core/core.c src/bundles/c/core/run-main.c src/bundles/c/core/run-repl.c src/bundles/c/core/worker-bootstrap.c

src/bundles/c/stdlib/%.c: $(QJSC) src/bundles/js/stdlib/%.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "tjs:$(basename $(notdir $@))" \
		-p tjs__ \
		src/bundles/js/stdlib/$(basename $(notdir $@)).js

src/bundles/js/stdlib/%.js: src/js/stdlib/*.js src/js/stdlib/ffi/*.js
	$(ESBUILD) src/js/stdlib/$(notdir $@) \
		--bundle \
		--outfile=$@ \
		--external:buffer \
		--external:crypto \
		$(ESBUILD_PARAMS_MINIFY) \
		$(ESBUILD_PARAMS_COMMON)

src/bundles/c/stdlib/%.c: $(QJSC) src/bundles/js/stdlib/%.js
	@mkdir -p $(basename $(dir $@))
	$(QJSC) -m \
		$(QJSC_PARAMS_STIP) \
		-o $@ \
		-n "tjs:$(basename $(notdir $@))" \
		-p tjs__ \
		src/bundles/js/stdlib/$(basename $(notdir $@)).js

stdlib: $(addprefix src/bundles/c/stdlib/, $(patsubst %.js, %.c, $(notdir $(STDLIB_MODULES))))

js: core stdlib

install: $(TJS)
	$(CMAKE) --build $(BUILD_DIR) --target install

clean: $(BUILD_DIR)
	$(CMAKE) --build $(BUILD_DIR) --target clean

debug:
	BUILDTYPE=Debug $(MAKE)

distclean:
	@rm -rf $(BUILD_DIR)
	@rm -rf src/bundles/js/

format:
	clang-format -i src/*.{c,h}

test:
	./$(BUILD_DIR)/tjs test tests/

test-advanced:
	cd tests/advanced && npm install
	./$(BUILD_DIR)/tjs --stack-size 10485760 test tests/advanced/

.PRECIOUS: src/bundles/js/core/%.js src/bundles/js/stdlib/%.js
.PHONY: all js debug install clean distclean format test test-advanced core stdlib $(TJS)
