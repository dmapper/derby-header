var derby = require('derby');
var util = derby.util;

var components = require('derby/lib/components');

var App = require('derby/lib/App');
var Page = require('derby/lib/Page');
var Controller = require('derby/lib/Controller');

var derbyTemplates = require('derby-templates');
var templates = derbyTemplates.templates;
var expressions = derbyTemplates.expressions;

var ComponentFactory = components.ComponentFactory;
var Component = components.Component;

var Model = derby.Model;

function isPlainObject(obj){
  return (Object.prototype.toString.call(obj) === "[object Object]")
}

templates.ComponentMarker.prototype.emit = function(context, node) {
  node.$component = context.controller;
  context.controller.markerNode = node;
  bindIndividualAttributes(context, node);
  bindObjectAttributes(context, node);
};

function bindIndividualAttributes(context, node){
  var parentContext = context.parent;
  var component = context.controller;
  if (!component._attributeList) return;
  component._attributeList.forEach(function(key){
    var attribute = parentContext.attributes[key];
    var comonentAttribute = new ComponentAttribute(context.controller, key, attribute);
    comonentAttribute.getBound(parentContext, node);
    component.model.on('change', key, function(value, oldValue){
      if (key === 'id') return;
      if (!attribute.expression) return;
      if (!attribute.expression.set) return;
      if (!util.deepEqual(value, oldValue)) {
        try {
          attribute.expression.set(context, value);
        } catch(err) {}
      }
    });
  })
}

function ComponentAttribute(component, name, expression) {
  this.component = component;
  this.name = name;
  this.expression = expression;
  this.model = component.model;
}

ComponentAttribute.prototype = new templates.Attribute();
ComponentAttribute.prototype.getBound = function(context, element) {
  context.addBinding(new templates.AttributeBinding(this, context, element, this.name));
};

ComponentAttribute.prototype.update = function(context, binding) {
  var value = getUnescapedValue(this.expression, context);
  if (!util.deepEqual(value, this.model.get(this.name))) {
    this.model.setDiffDeep(this.name, util.deepCopy(value));
  }
};

function getUnescapedValue(expression, context) {
  var unescaped = true;
  var value = expression.get(context, unescaped);
  while (value instanceof templates.Template) {
    value = value.get(context, unescaped);
  }
  return value;
}


function bindObjectAttributes(context, node){
  var parentContext = context.parent;
  var component = context.controller;
  if (!parentContext.attributes) return;
  var attributes = parentContext.attributes['attributes'];
  if (!attributes) return;
  var attributesMeta = component._attributesMeta;

  if(attributesMeta.type === 'literal') return;
  var comonentAttribute = new ComponentAttributes(context.controller, attributes.expression || attributes.template);
  comonentAttribute.getBound(parentContext, node);
}

function ComponentAttributes(component, expression) {
  this.component = component;
  this.expression = expression;
  this.expression.supportObject = true;

  this.name = 'attributes';
  this.attributeType = component._attributesMeta.type;
  this._meta = component._attributesMeta;
  this.model = component.model;
}

ComponentAttributes.prototype = new templates.Attribute();
ComponentAttributes.prototype.getBound = function(context, element) {
  context.addBinding(new templates.AttributeBinding(this, context, element, 'attributes'));
};

ComponentAttributes.prototype.update = function(context, binding) {
  var newValue = getUnescapedValue(this.expression, context);

  if (this.attributeType === 'ref') {
    this.updateRef(newValue, context);
  } else {
    this.updateExp(newValue, context);
  }
};

ComponentAttributes.prototype.updateRef = function(newValue, context){
  var model = this.model;
  var newValues = {};
  var newValueIsObject = isPlainObject(newValue);
  var segments = this.expression.pathSegments(context);
  var force = !util.deepEqual(segments, this._meta.segments);

  // REMOVE

  // new: obj, old: field
  if (newValueIsObject && !this._meta.oldValueIsObject){
    // unref 'attributes' ref
    model.root.removeRef(model.at + '.attributes');
  }
  // new: field, old: obj
  if (!newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      model.root.removeRef(model.at + '.' + key);
    }
  }
  // new: obj, old: obj
  if (newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      if (key in newValue && !force) continue;
      model.root.removeRef(model.at + '.' + key);
    }
  }

  // ADD

  if (newValueIsObject){
    for(var key in newValue) {
      if (key in context.attributes) continue;
      newValues[key] = true;
      if (key in this._meta.oldValues && !force) continue;
      refAttribute(model, key, segments.join('.') + '.' + key);
    }
    this._meta.oldValueIsObject = true
    this._meta.oldValues = newValues;
  } else {
    this._meta.oldValues = undefined;
    refAttribute(model, 'attributes', segments.join('.'));
    this._meta.oldValueIsObject = false
  }

  this._meta.segments = segments;
};

ComponentAttributes.prototype.updateExp = function(newValue, context){
  var model = this.model;
  var newValues = {};
  var newValueIsObject = isPlainObject(newValue);

  // REMOVE

  // new: obj, old: field
  if (newValueIsObject && !this._meta.oldValueIsObject){
    model.del('attributes');
  }
  // new: field, old: obj
  if (!newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) model.del(key);
  }
  // new: obj, old: obj
  if (newValueIsObject && this._meta.oldValueIsObject){
    for(var key in this._meta.oldValues) {
      if (key in newValue) continue;
      model.del(key);
    }
  }

  // ADD

  if (newValueIsObject){
    for(var key in newValue) {
      if (key in context.attributes) continue;
      newValues[key] = true;
      if (!util.deepEqual(model.get(key), newValue[key])) {
        model.setDiffDeep(key, util.deepCopy(newValue[key]));
      }
    }
    this._meta.oldValueIsObject = true
    this._meta.oldValues = newValues;
  } else {
    this._meta.oldValues = undefined;

    if (!util.deepEqual(model.get('attributes'), newValue)) {
      model.setDiffDeep('attributes', util.deepCopy(newValue));
    }

    this._meta.oldValueIsObject = false
  }
};

function emitInitHooks(context, component) {
  if (!context.initHooks) return;
  // Run initHooks for `on` listeners immediately before init
  for (var i = 0, len = context.initHooks.length; i < len; i++) {
    context.initHooks[i].emit(context, component);
  }
}

function initComponent(context, component, parent, model, id, scope) {
  // Do generic controller initialization
  var componentContext = context.componentChild(component);
  Controller.call(component, parent.app, parent.page, model);
  Component.call(component, parent, componentContext, id, scope);

  // Do the user-specific initialization. The component constructor should be
  // an empty function and the actual initialization code should be done in the
  // component's init method. This means that we don't have to rely on users
  // properly calling the Component constructor method and avoids having to
  // play nice with how CoffeeScript extends class constructors
  emitInitHooks(context, component);
  component.emit('init', component);
  if (component.init) component.init(model);

  return componentContext;
}

function setAttributes(component, context, model) {
  if (!context.attributes) return;
  // Set attribute values on component model
  for (var key in context.attributes) {
    var attribute = context.attributes[key];
    if (key === 'attributes'){
      setAttributesObjectValue(attribute, component, context, model);
      continue;
    }
    setAttribute(key, attribute, component, context, model);
  }
}

function setAttribute(key, attribute, component, context, model){
  model = model.silent();
  var segments = getSegments(attribute, context);
  if (segments) {
    model.root.ref(model._at + '.' + key, segments.join('.'), {updateIndices: true});
  } else {
    if (attribute instanceof templates.ParentWrapper) {
      if (attribute.isPartial){
        model.set(key, attribute);
      } else {
        component._attributeList = component._attributeList || [];
        component._attributeList.push(key);
        model.set(key, util.deepCopy(attribute.get(context, true)));
      }
    } else {
      model.set(key, attribute);
    }
  }
}

function setAttributesObjectValue(attributes, component, context, model) {
  var attributesMeta = component._attributesMeta = {};
  attributesMeta.oldValues = {};

  var segments = getSegments(attributes, context);

  // Refs
  if (segments) {
    attributesMeta.type = 'ref';
    attributesMeta.segments = segments;
    var value = attributes.get(context, true);
    if (!isPlainObject(value)) {
      refAttribute(model, 'attributes', segments.join('.'));
      attributesMeta.oldValueIsObject = false;
      return;
    }
    attributesMeta.oldValueIsObject = true;
    for (var key in value) {
      if (key in context.attributes) continue;
      attributesMeta.oldValues[key] = true;
      refAttribute(model, key, segments.join('.') + '.' + key)
    }

  } else {
    // Expr
    if (attributes instanceof templates.ParentWrapper) {
      attributesMeta.type = 'expression';
      var value = attributes.get(context, true);
      if (!isPlainObject(value)) {
        model.set('attributes', util.deepCopy(value));
        attributesMeta.oldValueIsObject = false;
        return;
      }
      attributesMeta.oldValueIsObject = true;
      attributesMeta.oldValues = {};

      for (var key in value) {
        if (key in context.attributes) continue;
        attributesMeta.oldValues[key] = true;
        model.set(key, value[key]);
      }
    // Const
    } else {
      var value = attributes;
      attributesMeta.type = 'literal';

      if (isPlainObject(value)) {
        for (var key in attributes) {
          model.set(key, attributes[key]);
        }
      } else {
        model.set('attributes', attributes);
      }
    }
  }
}

function getSegments(attribute, context){
  var segments = (
    attribute instanceof templates.ParentWrapper &&
    attribute.expression &&
    attribute.expression.pathSegments(context)
  );
  return segments;
}

function refAttribute(model, key, path){
  model.root.ref(model._at + '.' + key, path, {updateIndices: true});
}


if (!derby.util.isServer) {

  ComponentFactory.prototype.init = function(context){
    var global = context.controller.page.global;

    var component = new this.constructor();

    var parent = context.controller;
    var id = context.id();
    var scope = ['$components', id];
    if (global) {
      scope = ['$globalComponents', id];
    }

    var model = parent.model.root.eventContext(component);
    model._at = scope.join('.');
    model.set('id', id);
    setAttributes(component, context, model);
    // Store a reference to the component's scope such that the expression
    // getters are relative to the component
    model.data = model.get();

    parent.page._components[id] = component;

    return initComponent(context, component, parent, model, id, scope);
  };

  Model.prototype.unloadAll = function () {
    var contexts = this.root._contexts;
    for (var key in contexts) {
      if (key !== 'global') {
        contexts[key].unload();
      }
    }
  };

  var originalFinishInit = App.prototype._finishInit;

  App.prototype._finishInit = function () {
    var globalPage = this.createGlobalPage();
    originalFinishInit.call(this);
    globalPage.render();
  };


  App.prototype.createGlobalPage = function () {

    if (this.page && this.globalPage) {
      this.emit('destroyGlobalPage', this.globalPage);
      this.globalPage.destroy();
    }

    function createGlobalAppPage() {
      // Inherit from Page so that we can add controller functions as prototype
      // methods on this app's pages
      function GlobalAppPage() {
        Page.apply(this, arguments);
      }

      GlobalAppPage.prototype = Object.create(Page.prototype);

      GlobalAppPage.prototype.global = true;

      GlobalAppPage.prototype._setRenderPrefix = function () {
      };

      GlobalAppPage.prototype.render = function (ns) {
        this.context.pause();
        var headerFragment = this.getFragment('HeaderElement', ns);
        var headerElement = document.getElementById('header');
        headerElement.parentNode.replaceChild(headerFragment, headerElement);
        this.context.unpause();
      };

      GlobalAppPage.prototype.destroy = function () {
        this.emit('destroy');
        this._removeModelListeners();
        for (var id in this._components) {
          var component = this._components[id];
          component.destroy();
        }
        // Remove all data, refs, listeners, and reactive functions
        // for the previous page
        var silentModel = this.model.silent();
        silentModel.destroy('_globalPage');
        silentModel.destroy('$globalComponents');
        // Unfetch and unsubscribe from all queries and documents
        silentModel.unloadAll && silentModel.unloadAll();
      };

      return GlobalAppPage;
    }

    this.GlobalPage = createGlobalAppPage();
    this.globalPage = new this.GlobalPage(this, this.model);
    return this.globalPage;
  };

  Page.prototype.render = function (ns) {
    this.app.emit('render', this);
    this.context.pause();
    this._setRenderParams(ns);
    var titleFragment = this.getFragment('TitleElement', ns);
    var bodyFragment = this.getFragment('BodyElement', ns);
    var titleElement = document.getElementsByTagName('title')[0];
    var bodyElement = document.getElementById('body');
    titleElement.parentNode.replaceChild(titleFragment, titleElement);
    bodyElement.parentNode.replaceChild(bodyFragment, bodyElement);
    this.context.unpause();
    this.app.emit('routeDone', this, 'render');
  };

  Page.prototype.attach = function () {
    this.context.pause();
    var ns = this.model.get('$render.ns');
    var titleView = this.getView('TitleElement', ns);
    var bodyView = this.getView('BodyElement', ns);
    var titleElement = document.getElementsByTagName('title')[0];
    var bodyElement = document.getElementById('body');
    titleView.attachTo(titleElement.parentNode, titleElement, this.context);
    bodyView.attachTo(bodyElement.parentNode, bodyElement, this.context);
    if (this.create) this.create(this.model, this.dom);
    this.context.unpause();
  };
}

// Custom layout with <div id="header"> and <div id="body">
if (!App.prototype.__patchedDerbyHeader) {
  App.prototype._loadBaseViews = function () {
    this.views.register('Page',
            '<!DOCTYPE html>' +
            '<meta charset="utf-8">' +
            '<view is="{{$render.prefix}}TitleElement"></view>' +
            '<view is="{{$render.prefix}}Styles"></view>' +
            '<view is="{{$render.prefix}}Head"></view>' +
            '<body>' +
            '<view is="HeaderElement"></view>' +
            '<view is="{{$render.prefix}}BodyElement"></view>',
        {serverOnly: true}
    );
    this.views.register('BootstrapPage',
            '<!DOCTYPE html>' +
            '<meta charset="utf-8">' +
            '<view is="{{$render.prefix}}TitleElement"></view>' +
            '<view is="{{$render.prefix}}Styles"></view>' +
            '<view is="{{$render.prefix}}Head"></view>' +
            '<body>' +
            '<div id="header"></div>' +
            '<div id="body"><div id="BootstrapLoading"></div></div>',
        {serverOnly: true}
    );
    this.views.register('TitleElement',
        '<title><view is="{{$render.prefix}}Title"></view></title>'
    );

    this.views.register('HeaderElement',
            '<div id="header">' +
            '<view is="Header"></view>' +
            '</div>'
    );

    this.views.register('BodyElement',
            '<div id="body" class="{{$bodyClass($render.ns)}}">' +
            '<view is="{{$render.prefix}}Body"></view>' +
            '</div>'
    );
    this.views.register('Title', 'Derby App');
    this.views.register('Styles', '', {serverOnly: true});
    this.views.register('Head', '', {serverOnly: true});
    this.views.register('Header', '');
    this.views.register('Body', '');
    this.views.register('Tail', '');
  };

  App.prototype.__patchedDerbyHeader = true;
}
