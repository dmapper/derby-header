var derby = require('derby');

require('derby-header');

var app = module.exports = derby.createApp('twopages', __filename);

app.use(require('derby-debug'));

app.loadViews(__dirname);
app.loadStyles(__dirname);

app.component(require('comp1'));

app.get('/', function(page, model) {
  page.render('home');
});

app.get('/second', function(page, model) {
  page.render('second');
});