import express = require('express');
import raw_data from '../app/ShortHistory.json';
import moment = require('moment');
import * as tf from '@tensorflow/tfjs'
import { Sequential } from '@tensorflow/tfjs';
import { ModelLoggingVerbosity } from '@tensorflow/tfjs-layers/dist/base_callbacks';
import {Server} from "./server";

const app: express.Application = express();
const POINT_PRECISION = 10000000;
const POINT_GROUP_PRECISION = 10000;
class Main {
   private readyData: any[] = [];
   private data: any = raw_data;
   private serverClass: Server;
   constructor(serverClass: Server) {
      this.serverClass = serverClass;
   }

   async start() {
      this.serverClass.buildServer();
      this.readyData = this.dataMunging(this.data.locations);
      console.log(this.readyData.length);
      // this.writeDataToConsole(this.readyData);
      this.createModel();
      const tensorData = this.convertToTensor(this.readyData);
      const {inputs, labels} = tensorData;
      await this.trainModel(this.createModel(), inputs, labels);
      console.log('Done Training');
   }
   
   async trainModel(model: Sequential, inputs: any, labels: any) {
      // prepare model for training
      model.compile({
         optimizer: tf.train.adam(),
         loss: tf.losses.meanSquaredError,
         metrics: ['mse']
      });
      
      const batchSize = 10000;
      const epochs = 2;
      
      return await model.fit(inputs, labels, {
         batchSize,
         epochs,
         verbose: ModelLoggingVerbosity.VERBOSE
      });
      
      
   }
   
   private convertToTensor(data: any[]) {
      return tf.tidy(() => {
         // Step 1. Shuffle the data
         tf.util.shuffle(data);
   
         const inputs = data.map(d=> [d.month, d.dayOfWeek, d.timeGroup]);
         const labels = data.map(d => [d.latGroup, d.longGroup]);
         console.log(labels);
   
         const inputTensor = tf.tensor2d(inputs, [inputs.length, 3]);
         const labelTensor = tf.tensor2d(labels, [labels.length, 2]);
   
         //Step 3. Normalize the data to the range 0 - 1 using min-max scaling
         const inputMax = inputTensor.max();
         const inputMin = inputTensor.min();
         const labelMax = labelTensor.max();
         const labelMin = labelTensor.min();
   
         const normalizedInputs = inputTensor.sub(inputMin).div(inputMax.sub(inputMin));
         const normalizedLabels = labelTensor.sub(labelMin).div(labelMax.sub(labelMin));
   
         return {
            inputs: normalizedInputs,
            labels: normalizedLabels,
            // Return the min/max bounds so we can use them later.
            inputMax,
            inputMin,
            labelMax,
            labelMin,
         }
      });
   }
   
   private createModel() {
      // Create a sequential model
      const model = tf.sequential();
      
      // Add a single hidden layer
      model.add(tf.layers.dense(({inputShape:[3], units: 1, useBias: true})));
      
      // Add an output layer
      model.add(tf.layers.dense({units: 2, useBias: true}));
      
      return model;
      
      
   }
   
   private dataMunging(locations: any[]) {
      return locations.map(location => {
         location.lat = location.latitudeE7 / POINT_PRECISION;
         location.long = location.longitudeE7 / POINT_PRECISION;
         location.latGroup = Math.floor(location.latitudeE7 / POINT_GROUP_PRECISION);
         location.longGroup = Math.floor(location.longitudeE7 / POINT_GROUP_PRECISION);
         let timeStamp = moment().millisecond(location.timestampMs);
         location.dayOfWeek = timeStamp.day();
         location.hourOfDay = timeStamp.hour(); //TODO: check if 12 ot 24 clock
         location.minute = timeStamp.minute();
         location.month = timeStamp.month();
         location.timeGroup = Math.floor((location.hourOfDay * 60 + location.minute) / 10);
         return location;
      });
          //.filter((location) => (location.latGroup != null && location.longGroup != null && location.timestampMs != null));
   }

   // private buildServer() {
   //    app.get('/', function(req, res) {
   //       res.send('Hello world');
   //    });
   //
   //    app.listen(3000, function() {
   //       console.log('Listening on port 3000')
   //    });
   // }
   
}

let main = new Main();
main.start();