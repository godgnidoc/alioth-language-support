SSRC = $(wildcard syntaxes/*.yaml)
SDST = $(SSRC:%.yaml=%.json)

all: $(SDST)

$(SDST):%.json:%.yaml
	npx js-yaml $< > $@