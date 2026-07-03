import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'translate', standalone: true, pure: false })
export class FakeTranslatePipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}
