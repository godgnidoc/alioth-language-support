SSRC = $(wildcard syntaxes/*.yaml)
SDST = $(SSRC:%.yaml=%.json)

all: $(SDST) $(DST)

$(SDST):%.json:%.yaml
	npx js-yaml $< > $@