// import '@tensorflow/tfjs-node';
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as faceapi from 'face-api.js';
import { Canvas, Image, ImageData, loadImage } from 'canvas';
import * as path from 'path';

faceapi.env.monkeyPatch({
  Canvas: Canvas as any,
  Image: Image as any,
  ImageData: ImageData as any
});

@Injectable()
export class FaceService implements OnModuleInit {
  // private modelPath = path.join(process.cwd(), 'models');
  private isLoaded = false;
  private modelPath = this.getModelPath();
  private getModelPath(): string {
    const distPath = path.join(process.cwd(), 'dist/models');
    const rootPath = path.join(process.cwd(), 'models');
     
    if (require('fs').existsSync(distPath)) {
      // console.log('✅ Using dist/models');
      return distPath;
    }
 
    // console.log('✅ Using root/models');
    return rootPath;
  }

  async onModuleInit() {
    await this.loadModels();
  }

  async loadModels() {
    if (this.isLoaded) return;

    await faceapi.nets.ssdMobilenetv1.loadFromDisk(this.modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(this.modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(this.modelPath);

    this.isLoaded = true;
    // console.log('✅ Face models loaded');
  }

  async getDescriptorFromBuffer(buffer: Buffer): Promise<Float32Array | null> {
    await this.loadModels();

    const img: any = await loadImage(buffer);

    const detection = await faceapi
      .detectSingleFace(img)
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) {
      console.log('❌ No face detected');
      return null;
    }

    return detection.descriptor;
  }

  compareFaces(desc1: Float32Array, desc2: Float32Array): boolean {
    const distance = faceapi.euclideanDistance(desc1, desc2);
    console.log('🔍 Face distance:', distance);

    return distance < 0.5; // threshold
  }
}