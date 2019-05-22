# alioth-language-support

![](https://dn-ezr.cn/assets/img/icon_with_text.png)

This extension is under developing.

## Features

- color support

  Maybe the worst color support, I'm trying to get it better.

- semantic check
  
  this require you to have the Alioth compiler installed

## Requirements

Presently, we can only support the platform of linux, and you have to make sure that your alioth compiler is avaliable.

- The Compiler of Alioth

  You can visit https://dn-ezr.cn for more information about the Alioth programming language, and that is also where you get the download link of the compiler.

## Extension Settings

There's no need to configure this extension right now.

## Known Issues

- bad color support
  
  Limited by the ability of regular expression, the color support is not ready right now.

- big cost
  
  When checking semantics, this extension runs the alioth compiler which is named 'aliothc' by now, this will cost a lot.

## Release Notes

This is the first release.

### 0.0.6

Add some color support to new language standard.

### 0.0.5

Fix bug where .vscodeignore cause bad dependencies.

### 0.0.2

Fix problem where dependencies were bad.

### 0.0.1

Initial release of Alioth language support.