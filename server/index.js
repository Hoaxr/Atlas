require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());

app.use('/api', apiRoutes);
app.use(errorHandler);

app.listen(PORT, () => console.log(`[Backend] Server op poort ${PORT}`));
