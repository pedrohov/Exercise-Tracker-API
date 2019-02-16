const express = require('express')
const app = express()
const bodyParser = require('body-parser')
const moment = require('moment')

const cors = require('cors')

const mongoose = require('mongoose')
process.env.MONGO_URI = "mongodb+srv://muser:muser@cluster0-eoh8c.mongodb.net/tracker?retryWrites=true";
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true })

// Create Mongoose schemas:
var exerciseSchema = new mongoose.Schema({
  "description": { type: String, required: true, minlength: 3, maxlength: 30 },
  "duration": { type: Number, required: true, min: 1 },
  "date": { type: Date, default: Date.now }
});

var userSchema = new mongoose.Schema({
  "username": { type: String, required: true, unique: true, minlength: 3, maxlength: 10 },
  "log": [ exerciseSchema ]
});

var User = new mongoose.model('User', userSchema);

app.use(cors())

app.use(bodyParser.urlencoded({extended: false}))
app.use(bodyParser.json())

app.use(express.static('public'))
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/views/index.html')
});

// Regex to check date format:
let UTC_regex = /\d\d\d\d-\d\d-\d\d/;
function isDateValid(date) {
  if(UTC_regex.test(date)) {
    // Check if the string is a valid UTC date:
    if(moment.utc(date).isValid())
      return new Date(date);
  }
  // Check if the string can be converted to integer:
  else if(isNaN(date)) {
    return false;
  }
  // Return new date usigin 'date' as milliseconds:
  return new Date(parseInt(date));
}

// New user endpoint:
app.post('/api/exercise/new-user', function(req, res) {
  let newUser = User({username: req.body.username});
  newUser.save({ runValidators: true }, function(err, doc) {
    // Check for validation errors:
    if(err && err.errors)
      return res.send(err.errors['username'].message); 
    // If username already exists:
    else if(err)
      return res.send("Username already taken.");
    
    // Return the new document's data:
    return res.json({
      "username": doc.username,
      "_id": doc._id
    });
  });
});

// Query users:
app.get('/api/exercise/users', function(req, res) {
  User.find({})
      .select('username _id')
      .exec(function(err, docs) {
        res.json(docs);
      });
});

// New exercide endpoint:
app.post('/api/exercise/add', function(req, res) {
  
  // Create date:
  let date = new Date();
  if(req.body.date) {
    date = isDateValid(req.body.date);
    if(date === false)
      return res.send("Invalid `date`.");
  }
  
  // Create a new exercise:
  let newExercise = {
    "description": req.body.description,
    "duration": req.body.duration,
    "date": date
  };
    
  User.findByIdAndUpdate(req.body.userId,
    { "$push": {"log": newExercise} }, { new: true, runValidators: true },
    function(err, doc) {
      // Check for validation errors:
      if(err && err.errors) {
        if(err.errors['log'].errors['description'])
          return res.send(err.errors['log'].errors['description'].message);
        else if(err.errors['log'].errors['duration'])
          return res.send(err.errors['log'].errors['duration'].message);
      }
      // Check for id not found:
      else if(err)
        return res.send("User not found.");

      return res.json(
        Object.assign(newExercise, {_id: req.body.userId, username: doc.username})
      );
    });
});

// Query exercises:
app.get('/api/exercise/log', function(req, res) {
  // Create query:
  let query = { _id: req.query.userId }
  if(req.query.from) {
    let date = isDateValid(req.query.from);
    if(date !== false)
      query['log.date'] = { $gte: date };
    else
      // Invalid date format:
      return res.json('Invalid date: `from`.');
  }
  if(req.query.to) {
    let date = isDateValid(req.query.to);
    if(date !== false)
      query['log.date']['$lte'] = date;
    else
      // Invalid date format:
      return res.json('Invalid date: `to`.');
  }
  
  // Parse limit:
  let limit = undefined;
  if(req.query.limit)
    limit = parseInt(req.query.limit);
  
  User.findOne(query)
      .limit(limit) // [Unused]: Is limiting over users and not logs
      .select('_id username log.date log.description log.duration')
      .exec(function(err, doc) {
        if(err)
          return res.send('Unknown userId.');
        
        if(limit)
          doc.log = doc.log.slice(0, limit);
        return res.json(doc);
      });
});

// Not found middleware
app.use((req, res, next) => {
  return next({status: 404, message: 'not found'})
})

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage

  if (err.errors) {
    // mongoose validation error
    errCode = 400 // bad request
    const keys = Object.keys(err.errors)
    // report the first validation error
    errMessage = err.errors[keys[0]].message
  } else {
    // generic or custom error
    errCode = err.status || 500
    errMessage = err.message || 'Internal Server Error'
  }
  res.status(errCode).type('txt')
    .send(errMessage)
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log('Your app is listening on port ' + listener.address().port)
})
