'''Award trophy: walnut plinth with a gold cup and handles.'''
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lib'))
from common import *
import kit

reset()
join(kit.trophy('t_', 0, 0, 0, s=1.15), 'trophy')
scale_all(1.25)
export()
