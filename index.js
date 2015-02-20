var derby = require('derby');
var util = derby.util;

var components = require('derby/lib/components');

var App = require('derby/lib/App');
var Page = require('derby/lib/Page');
var Controller = require('derby/lib//Controller');

var ComponentFactory = components.ComponentFactory;
var Component = components.Component;

var Model = derby.Model;


if (!derby.util.isServer) {

  Model.prototype.unloadAll = function(){

    var contexts = this.root._contexts;
    for (var key in contexts) {
      if (key !== 'global'){
        contexts[key].unload();
      }
    }
  };

  function emitHooks(context, component) {
    if (!context.hooks) return;
    // Kick off hooks if view pointer specified `on` or `as` attributes
    for (var i = 0, len = context.hooks.length; i < len; i++) {
      context.hooks[i].emit(context, component);
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
    emitHooks(context, component);
    component.emit('init', component);
    if (component.init) component.init(model);

    return componentContext;
  }

  function setAttributes(context, model) {
    if (!context.attributes) return;
    // Set attribute values on component model
    for (var key in context.attributes) {
      var attribute = context.attributes[key];

      var segments = (
          typeof attribute === 'object' &&
          attribute.type === 'ParentWrapper' &&
          attribute.expression &&
          attribute.expression.pathSegments(context)
          );

      if (segments) {
        model.root.ref(model._at + '.' + key, segments.join('.'));
      } else {
        model.set(key, attribute);
      }
    }
  }

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
    setAttributes(context, model);
    // Store a reference to the component's scope such that the expression
    // getters are relative to the component
    model.data = model.get();

    parent.page._components[id] = component;

    return initComponent(context, component, parent, model, id, scope);
  };

  var originalFinishInit = App.prototype._finishInit;

  App.prototype._finishInit = function () {
    var globalPage = this.createGlobalPage();
    originalFinishInit.call(this);
    globalPage.render();
  };


  App.prototype.createGlobalPage = function () {

    if (this.page) {
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

      GlobalAppPage.prototype.render = function (ns) {
        this.context.pause();
        var headerFragment = this.getFragment('HeaderElement', ns);
        var headerElement = document.getElementById('header');
        headerElement.parentNode.replaceChild(headerFragment, headerElement);
        this.context.unpause();
      };

      GlobalAppPage.prototype.destroy = function() {
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


} else {
  var fs = derby.util.serverRequire(module, 'fs');
  var path = derby.util.serverRequire(module, 'path');
  var files = derby.util.serverRequire(module, 'derby/lib/files');

  var STYLE_EXTENSIONS = ['.css'];
  var VIEW_EXTENSIONS = ['.html'];
  var COMPILERS = {
    '.css': files.cssCompiler, '.html': files.htmlCompiler
  };


  if (!App.prototype.__putched) {
    App.prototype._init = function () {
      this.scriptFilename = null;
      this.scriptMapFilename = null;
      this.scriptUrl = null;
      this.scriptMapUrl = null;
      this.clients = null;
      this.styleExtensions = STYLE_EXTENSIONS.slice();
      this.viewExtensions = VIEW_EXTENSIONS.slice();
      this.compilers = util.copyObject(COMPILERS);

      this.serializedDir = path.dirname(this.filename) + '/derby-serialized';
      this.serializedBase = this.serializedDir + '/' + this.name;
      if (fs.existsSync(this.serializedBase + '.json')) {
        this.deserialize();
        this.loadViews = function () {
        };
        this.loadStyles = function () {
        };
        return;
      }
      this.views.register('Page',
              '<!DOCTYPE html>' +
              '<meta charset="utf-8">' +
              '<view name="{{$render.prefix}}TitleElement"></view>' +
              '<view name="{{$render.prefix}}Styles"></view>' +
              '<view name="{{$render.prefix}}Head"></view>' +
              '<body>' +
              '<view name="HeaderElement"></view>' +
              '<view name="{{$render.prefix}}BodyElement"></view>',
          {serverOnly: true}
      );
      this.views.register('TitleElement',
          '<title><view name="{{$render.prefix}}Title"></view></title>'
      );

      this.views.register('HeaderElement',
              '<div id="header">' +
              '<view name="Header"></view>' +
              '</div>'
      );

      this.views.register('BodyElement',
              '<div id="body" class="{{$bodyClass($render.ns)}}">' +
              '<view name="{{$render.prefix}}Body"></view>' +
              '</div>'
      );
      this.views.register('Title', 'Derby App');
      this.views.register('Styles', '', {serverOnly: true});
      this.views.register('Head', '', {serverOnly: true});
      this.views.register('Header', '');
      this.views.register('Body', '');
      this.views.register('Tail', '');
    };

    App.prototype.__putched = true;
  }
}