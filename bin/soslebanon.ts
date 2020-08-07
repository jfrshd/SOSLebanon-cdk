#!/usr/bin/env node
import * as cdk from '@aws-cdk/core';
import { SoslebanonStack } from '../lib/stacks/soslebanon-stack';

const app = new cdk.App();
new SoslebanonStack(app, 'SoslebanonStack');
