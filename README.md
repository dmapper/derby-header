# Derby-Header (derbyjs layout with persistent header)

## Usage

In your derby-app:

```js
var derby = require('derby');

// Just require the package
require('derby-header');

var app = derby.createApp('twopages', __filename);
```

So, you have the layout:

```html
<html>
  <head>
     <!-- ....... -->
  </head>
  <body>
    <div id=header>
      <view is="Header"/>
    </div>
    <div id=body>
      <view is="Body"/>
    </div>
  </body>
</html>
```

All html in the #header-element is persistent and doesn't erase when app-routes 
are changing. You also can use components inside the #header.

The package is created for client rendering. So, if you want to subscribe to 
some data foy your header use component "create"-function. For example:

in my index.html:

```html
<!-- classic body layout-->
<Body:>
  <view is="{{$render.ns}}"/>
  
<Header:>
  <view is="header"/>
 
```

"header"-component example:

```js
module.exports = Header;

function Header(){}

Header.prototype.view = __dirname;
Header.prototype.style = __dirname;
Header.prototype.name = header;

Header.prototype.init = function(model){
}

Header.prototype.create = function(model){
  // Create a childModel with 'global' context
  // if we use regular root-model the subscription
  // is unsubscribed after url is changed
  
  this.globalModel = model.root.context('global');

  var items = this.globalModel.query('items', {});

  items.subscribe(function(err){
    items.ref(model.path('items'));
    model.set('loaded', true);
  });
}

Header.prototype.destroy = function(){
  this.globalModel.unload();
}

```

index.html
```html
<index:>
  {{if loaded}}
    <!-- ... -->
  {{/}}
```

## The MIT License

Copyright (c) 2015 Artur Zayats

Permission is hereby granted, free of charge, 
to any person obtaining a copy of this software and 
associated documentation files (the "Software"), to 
deal in the Software without restriction, including 
without limitation the rights to use, copy, modify, 
merge, publish, distribute, sublicense, and/or sell 
copies of the Software, and to permit persons to whom 
the Software is furnished to do so, 
subject to the following conditions:

The above copyright notice and this permission notice 
shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, 
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES 
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. 
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR 
ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, 
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE 
SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
